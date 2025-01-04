const core = require('@actions/core')
const github = require('@actions/github')
const STATIC_IMAGE_HOST = 'https://cdn.webshotarchive.dev'
const COMMENT_IDENTIFIER = '<!-- Timechain Uploaded Images Comment -->'

const findExistingComment = async (octokit, repo, issue_number) => {
  const { data: comments } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number
  })

  return comments.find(comment => comment.body.includes(COMMENT_IDENTIFIER))
}

function getExtension(mimetype) {
  const mimeToExtension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  }
  return mimeToExtension[mimetype] || 'bin'
}

const createOrUpdateComment = async (octokit, repo, issue_number, body) => {
  const existingComment = await findExistingComment(octokit, repo, issue_number)

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      ...repo,
      comment_id: existingComment.id,
      body
    })
    core.debug(`Comment updated: ${existingComment.html_url}`)
  } else {
    const { data: comment } = await octokit.rest.issues.createComment({
      ...repo,
      issue_number,
      body
    })
    core.debug(`Comment created: ${comment.html_url}`)
  }
}

const comment = async ({ images, token, message, commitSha }) => {
  try {
    const context = github.context
    const octokit = github.getOctokit(token)

    const tableRows = images
      .filter((image, index) => {
        const hasImage = !!image

        if (!hasImage) {
          core.debug(`No image found at index ${index}`)
        }
        return hasImage
      })
      .map(image => {
        // @todo fix this. make it dynamic, but png is the only supported format for now.
        const isFailed = /\(failed\)\.png$/.test(image.path)

        // const extension = getExtension(image.mimetype)
        const url = `${STATIC_IMAGE_HOST}/api/image/id/${image.uniqueId}.png`
        const diffUrl = `${STATIC_IMAGE_HOST}/api/image/id/${image.uniqueId}.diff.png`
        if (isFailed) {
          return `| ![${image.originalName}](${url}) ${image.originalName}| (failed)|`
        } else if (image.error) {
          return `| ![${image.originalName}](${url}) ${image.originalName}| ${image.error}|`
        } else if (!image.diffCount) {
          return `| ![${image.originalName}](${url}) ${image.originalName}| (new)|`
        } else if (image.diffCount > 0) {
          const host = 'https://www.webshotarchive.com'

          // const url = `${host}/project/dashboard/${image.projectId}/blob/${image.path}?showDuplicates=true&filterCommit=${compareCommitSha},${commitSha}&addToCompare=true`
          let link = ''
          if (image.diffCommitSha && commitSha) {
            const path = image.path.split('/').map(encodeURIComponent).join('/')
            const pre = image.diffCommitSha.substring(0, 10)
            const post = commitSha.substring(0, 10)
            const webshotUrl = `${host}/project/dashboard/${image.project}/blob/${path}?showDuplicates=true&filterCommit=${pre}%2C${post}&addToCompare=true`
            link = `[Webshot Archive ${post}...${pre}](${webshotUrl})`
          }
          return `| ![${image.originalName}](${url}) ${image.originalName}| ![${image.originalName}](${diffUrl}) ${image.diffCount}px / ${image.diffCommitSha?.substring(0, 10)} / ${link} |`
        }
        core.debug(`Unknown image: ${image.originalName}`)
        return ''
      })
      .join('\n')

    const table = `
| Image | Diff |
| ----- | ---- |
${tableRows}
    `

    const body = `
${COMMENT_IDENTIFIER}

${message ? `${message}\n\n` : ''}
${images.length ? '## Uploaded Images' : ''}

${images.length ? table : ''}
    `

    await createOrUpdateComment(
      octokit,
      context.repo,
      context.issue.number,
      body
    )
  } catch (error) {
    core.debug(error)
    core.setFailed(`Failed to create or update comment: ${error.message}`)
  }
}

module.exports = { comment }
