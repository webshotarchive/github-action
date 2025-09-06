const core = require('@actions/core')
const github = require('@actions/github')
const { wait } = require('./wait')
const fs = require('fs').promises
const path = require('path')
const mime = require('mime-types')
const { execSync } = require('child_process')
const { comment } = require('./comment')
const {
  getDefaultCommitSha,
  getDefaultCompareCommitSha,
  getDefaultBranchName,
  determineEventTypeAndMergedBranch,
  getDefaultComment
} = require('./defaultFields')

async function readFilesRecursively(dir) {
  const files = await fs.readdir(dir)
  const fileContents = []

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stats = await fs.stat(filePath)

    if (stats.isDirectory()) {
      fileContents.push(...(await readFilesRecursively(filePath)))
    } else {
      core.debug(`Reading file ${filePath}`)
      if (filePath.endsWith('.png')) {
        const content = await fs.readFile(filePath, 'utf8')
        fileContents.push({
          name: file,
          path: filePath,
          content
        })
      } else {
        core.debug(`Only uploading png files, skipping ${filePath}`)
      }
    }
  }

  return fileContents
}

function uploadImage(imageFile, fileName, opts = {}) {
  const formData = new FormData()
  formData.append('file', imageFile, fileName) // Changed 'image' to 'file'
  formData.append('commitSha', opts.commitSha)
  formData.append('compareCommitSha', opts.compareCommitSha)
  formData.append('path', opts.path)
  formData.append('branchName', opts.branchName)
  formData.append('compareBranch', opts.compareBranch)
  formData.append('projectId', opts.projectId)
  formData.append('eventName', opts.eventName)
  formData.append('visualIndex', opts.visualIndex)
  formData.append('authorName', opts.author?.name || '')
  formData.append('authorEmail', opts.author?.email || '')

  if (opts.prNumber) {
    formData.append('prNumber', opts.prNumber)
  }

  if (opts.mergedBranch) {
    formData.append('mergedBranch', opts.mergedBranch)
  }

  core.debug(`tags ${JSON.stringify(opts.tags)}`)
  if (opts.tags) {
    const tagsAsArray = opts.tags || []

    if (tagsAsArray.length > 0) {
      const asString = tagsAsArray.join(',')
      core.debug(`tags as string ${asString}`)
      formData.append('tags', asString)
    }
  }

  return fetch('https://api.webshotarchive.com/api/image/upload', {
    method: 'POST',
    body: formData,
    timeout: 10000,
    headers: {
      'x-client-id': opts.clientId,
      'x-client-secret': opts.clientSecret
    }
  })
}

async function readAndUploadImage(imagePath, opts = {}) {
  if (!opts.clientId || !opts.clientSecret || !opts.commitSha) {
    throw new Error('clientId and clientSecret and Commit Sha are required')
  }
  try {
    // Read the file from the given path
    const imageBuffer = await fs.readFile(imagePath)
    // Create a File object (or Blob in Node.js)
    const fileName = path.basename(imagePath)

    const ext = path.extname(imagePath)

    const mimeType = mime.lookup(ext)
    core.debug(`mimeType: ${mimeType}`)

    if (!mimeType) {
      throw new Error('Could not determine file type')
    }

    const imageFile = new Blob([imageBuffer], { type: mimeType }) // Adjust type if needed
    opts.path = imagePath

    // Call the uploadImage function
    const result = await uploadImage(imageFile, fileName, opts)

    return result
  } catch (error) {
    console.error('Error reading or uploading file:', error)
  }
}

function parseTagsFromName(fileName) {
  const tagPattern = /tags-\[(.*?)\]/
  const match = fileName.match(tagPattern)
  if (match && match[1]) {
    // Split by comma, then trim and filter out empty tags
    return match[1]
      .split(/\s*,\s*/)
      .filter(tag => tag.trim() !== '')
      .map(tag => tag.trim())
  }
  // playwright transform [tags] to --tagone-tagtwo--
  // does not support tags with dashhes such as full-page
  const playwrightPattern = /--([^-]+)--/ // Match content between -- anywhere in string
  const playwrightMatch = fileName.match(playwrightPattern)
  if (playwrightMatch && playwrightMatch[1]) {
    return playwrightMatch[1]
      .split('-')
      .filter(tag => tag.trim() !== '')
      .map(tag => tag.trim())
  }
  return []
}

/**
 * Get git commit information from a commit SHA
 * @param {string} commitSha - The commit SHA to get information for
 * @returns {Object} Object containing commit information
 */
function getGitCommitInfo(commitSha) {
  try {
    // Get commit message
    const message = execSync(`git show -s --format=%B ${commitSha}`)
      .toString()
      .trim()

    // Get author name
    const authorName = execSync(`git show -s --format=%an ${commitSha}`)
      .toString()
      .trim()

    // Get author email
    const authorEmail = execSync(`git show -s --format=%ae ${commitSha}`)
      .toString()
      .trim()

    // Get commit date
    const commitDate = execSync(`git show -s --format=%ci ${commitSha}`)
      .toString()
      .trim()

    // Get commit hash (short)
    const shortHash = execSync(`git show -s --format=%h ${commitSha}`)
      .toString()
      .trim()

    return {
      message,
      author: {
        name: authorName,
        email: authorEmail
      },
      date: commitDate,
      shortHash,
      fullHash: commitSha
    }
  } catch (error) {
    core.warning(
      `Failed to get git commit info for ${commitSha}: ${error.message}`
    )
    return null
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const { eventName, mergedBranch: defaultMergedBranchName } =
      determineEventTypeAndMergedBranch()
    // required fields
    const localPath = core.getInput('screenshotsFolder', { required: true })
    const clientId = core.getInput('clientId', { required: true })
    const projectId = core.getInput('projectId', { required: true })
    const clientSecret = core.getInput('clientSecret', { required: true })
    // defaulted fields
    const commitSha = core.getInput('commitSha') || getDefaultCommitSha()
    const compareCommitSha =
      core.getInput('compareCommitSha') || getDefaultCompareCommitSha()
    const compareBranch = core.getInput('compareBranch') // deprecated
    const branchName = core.getInput('branchName') || getDefaultBranchName()
    const commentInput = core.getInput('comment') || getDefaultComment()
    const mergedBranch =
      core.getInput('mergedBranch') || defaultMergedBranchName

    const failedTestPattern = core.getInput('failedTestPattern') || 'failed'
    const failedTestRegex = new RegExp(failedTestPattern)
    // nondefaulted fields
    const tags = core.getInput('tags')
    const visualIndex = core.getInput('visualIndex') || false

    const prNumber = github.context.payload.pull_request?.number

    core.info(`head commit sha: ${commitSha}`)
    core.info(`base commit sha: ${compareCommitSha}`)
    core.debug(`defaultMergedBranchName: ${defaultMergedBranchName}`)
    core.debug(`eventName: ${eventName}`)
    core.debug(`comment: ${commentInput}, ${typeof commentInput}`)

    // get the git commit from commitSha
    const gitCommitInfo = getGitCommitInfo(commitSha)
    const author = gitCommitInfo
      ? gitCommitInfo.author
      : {
          name: '',
          email: ''
        }

    const shouldComment = commentInput === true || commentInput === 'true'
    const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request'

    if (!localPath) {
      throw new Error('screenshotsFolder is required')
    }

    core.debug(`author: ${author.name}`)
    core.debug(`isPullRequest: ${isPullRequest}`)
    core.debug(`projectId: ${projectId}`)
    core.debug(`compareCommitSha: ${compareCommitSha}`)

    core.debug(`branchName: ${branchName}`)
    core.debug(`tags ${tags}, ${typeof tags}`)
    const screenshotFiles = await readFilesRecursively(localPath)
    core.debug(`Found ${screenshotFiles.length} files in ${path}`)

    // Prepare the files for upload
    const filesToUpload = screenshotFiles.map(file => ({
      name: file.name,
      path: file.path.replace(path, '').replace(/^\//, '') // Remove base path
      // content: Buffer.from(file.content).toString('base64') // Convert to base64
    }))

    core.debug(`filesToUpload: ${JSON.stringify(filesToUpload, null, 2)}`)
    const imageResponses = []
    for (const file of filesToUpload) {
      try {
        core.debug(`Uploading ${file.name}`)
        // parse tags out of name

        const tagsFromName = parseTagsFromName(file.path)
        const tagsAsArray = tags
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag)

        const allTags = new Set([...tagsAsArray, ...tagsFromName])

        if (failedTestRegex.test(file.path)) {
          allTags.add('failed')
        }
        if (github.context.eventName === 'pull_request') {
          allTags.add('pr')
        }
        const response = await readAndUploadImage(file.path, {
          clientId,
          clientSecret,
          commitSha,
          compareCommitSha,
          compareBranch,
          projectId,
          branchName,
          tags: Array.from(allTags),
          mergedBranch,
          eventName,
          visualIndex,
          author,
          prNumber
        })
        const resultJson = await response.json()
        core.debug(`image response: ${JSON.stringify(resultJson, null, 2)}`)

        if (resultJson.message) {
          if (resultJson.message.includes('Image uploaded successfully')) {
            core.info(`✅ ${file.name}: ${resultJson.message}`)
          } else {
            core.info(`ℹ️ ${file.name}: ${resultJson.message}`)
          }
        }

        let errorMessage = ''
        if (resultJson.error || resultJson.statusCode === 400) {
          errorMessage =
            resultJson.error || resultJson.message || 'unknown error'
          core.info(
            `${resultJson.statusCode >= 400 ? '❌' : 'ℹ️'} ${file.name}: ${errorMessage}`
          )
        }

        // only push if the response has changed if compareCommitSha is provided
        // or the image is failed
        if (errorMessage) {
          imageResponses.push({
            image: resultJson.data?.id,
            metadata: {
              ...resultJson.metadata,
              status: 'error',
              error: errorMessage
            }
          })
          // @todo make it so i can pass in this as a regex
        } else if (failedTestRegex.test(file.path)) {
          imageResponses.push({
            image: resultJson.data.id,
            metadata: {
              ...resultJson.metadata,
              status: 'failed',
              error: 'filepath regex exception'
            }
          })
        } else if (resultJson.data && resultJson.error) {
          const minPixToIgnore = resultJson.data?.minDiffPixelsToIgnore || 0
          imageResponses.push({
            image: resultJson.data.id,
            metadata: {
              ...resultJson.metadata,
              status: 'error',
              compareCommitSha: resultJson.metadata?.compareCommitSha,
              compareImage: resultJson.metadata?.compareImage,
              minDiffPixelsToIgnore: minPixToIgnore,
              diffCount: resultJson.data?.diffCount,
              diffImage: resultJson.data?.diffImage,
              compareImageTimestamp: resultJson.metadata?.compareImageTimestamp,
              error: resultJson.error
            }
          })
        } else if (compareCommitSha) {
          // Diff Images
          // if the image is different from the compare image, push it
          // if there is no compare image, push it (this is a new image)
          const minPixToIgnore = resultJson.data?.minDiffPixelsToIgnore || 0
          if (
            resultJson.data?.diffCount > minPixToIgnore ||
            !resultJson.metadata?.compareImage
          ) {
            imageResponses.push({
              image: resultJson.data?.id,
              metadata: {
                ...resultJson.metadata,
                status: resultJson.metadata?.compareImage ? 'diff' : 'new',
                compareCommitSha: resultJson.metadata?.compareCommitSha,
                compareImage: resultJson.metadata?.compareImage,
                minDiffPixelsToIgnore: minPixToIgnore,
                diffCount: resultJson.data?.diffCount,
                diffImage: resultJson.data?.diffImage,
                compareImageTimestamp:
                  resultJson.metadata?.compareImageTimestamp
              }
            })
          }
        } else if (resultJson.data) {
          // New Images
          imageResponses.push({
            image: resultJson.data?.id,
            metadata: {
              ...resultJson.metadata,
              status: 'new'
            }
          })
        }

        core.debug(
          `Uploading ${file.name}: ${response.status} ${response.statusText}`
        )
      } catch (error) {
        core.warning(`Failed to upload ${file.name}: ${error.message}`)
      }
    }

    if (shouldComment && isPullRequest && imageResponses.length) {
      await comment({
        images: imageResponses,
        commitSha,
        message: '',
        projectId,
        clientId,
        clientSecret
      })
    } else if (shouldComment && isPullRequest && imageResponses.length === 0) {
      core.warning('No new screenshots found')
      await comment({
        images: [],
        message: `No new screenshots found for commit ${commitSha}`,
        commitSha,
        projectId,
        clientId,
        clientSecret
      })
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

module.exports = {
  run,
  parseTagsFromName,
  getGitCommitInfo
}
