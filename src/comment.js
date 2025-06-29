const core = require('@actions/core')
const github = require('@actions/github')
const STATIC_IMAGE_HOST = 'https://cdn.webshotarchive.dev'
const COMMENT_IDENTIFIER = '<!-- Webshot Archive Uploaded Images Comment -->'

const createOrUpdateComment = async ({
  repo,
  issue_number,
  body,
  projectId,
  clientId,
  clientSecret
}) => {
  try {
    await fetch(
      `https://api.webshotarchive.com/api/github/actions/comment/${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          repo,
          issueNumber: issue_number,
          comment: body
        }),
        headers: {
          'x-client-id': clientId,
          'x-client-secret': clientSecret
        }
      }
    )
  } catch (error) {
    core.debug(error)
  }
}
const comment = async ({
  images,
  message,
  commitSha,
  failedTestRegex,
  projectId,
  clientId,
  clientSecret
}) => {
  try {
    const context = github.context

    const tableRows = images
      .filter((image, index) => {
        const hasImage = !!image

        if (!hasImage) {
          core.debug(`No image found at index ${index}`)
        }
        return hasImage
      })
      .map(image => {
        const host = 'https://www.webshotarchive.com'
        const isFailed = failedTestRegex.test(image.path)

        const url = `${STATIC_IMAGE_HOST}/api/image/id/${image.uniqueId}.png`
        const diffUrl = `${STATIC_IMAGE_HOST}/api/image/id/${image.uniqueId}.diff.png`
        if (isFailed) {
          return [
            `| ![${image.originalName}](${url}) |         |`,
            `| (failed)                         |         |`
          ].join('\n')
        } else if (image.originalName && image.error) {
          const compareImage = image.metadata?.compareImage
          if (compareImage) {
            let link = ''
            const path = image.path.split('/').map(encodeURIComponent).join('/')
            const post = commitSha.substring(0, 10)
            const pre = (image.metadata?.compareCommitSha || '').substring(
              0,
              10
            )

            const compareImageTimestamp = image.metadata?.compareImageTimestamp
              ? new Date(image.metadata?.compareImageTimestamp)
                  .toISOString()
                  .split('T')[0]
              : null
            core.debug(`path: ${path}`)
            core.debug(`compareImageTimestamp: ${compareImageTimestamp}`)
            const [createdAt] = new Date(image.createdAt)
              .toISOString()
              .split('T')
            core.debug(`createdAt: ${createdAt}`)
            const queryParams = [
              'showDuplicates=true',
              `filterCommit=${post}%2C${pre}`,
              'addToCompare=true',
              `startDate=${compareImageTimestamp || createdAt}`,
              `endDate=${createdAt}`,
              'imageSelectView=square'
            ].join('&')
            const webshotUrl = `${host}/project/dashboard/${image.project}/blob/${path}?${queryParams}`
            link = `[Webshot Archive ${post}...${pre}](${webshotUrl})`
            const compareSrc = `${STATIC_IMAGE_HOST}/api/image/id/${compareImage}.png`
            const diffCommitSha = (
              image?.metadata?.compareCommitSha || ''
            ).substring(0, 10)
            return [
              `| ![${image.originalName}](${url})    | ![${image.originalName}](${compareSrc}) |`,
              `| ${image.path}                       | ${image.error} ${diffCommitSha} / ${link} |`
            ].join('\n')
          }
          return `| ![${image.originalName}](${url}) ${image.originalName}| ${image.error}|`
        } else if (image.error) {
          return `| Error: | ${image.error}|`
        } else if (!image.diffCount) {
          return [
            `| ![${image.originalName}](${url}) ${image.originalName} | |`,
            `| (new)                                                  | |`
          ].join('\n')
        } else if (image.diffCount > 0) {
          // const url = `${host}/project/dashboard/${image.projectId}/blob/${image.path}?showDuplicates=true&filterCommit=${compareCommitSha},${commitSha}&addToCompare=true`
          let link = ''
          if (image.diffCommitSha && commitSha) {
            const path = image.path.split('/').map(encodeURIComponent).join('/')
            const pre = image.diffCommitSha.substring(0, 10)
            const post = commitSha.substring(0, 10)

            const compareImageTimestamp = image.compareImageTimestamp
              ? new Date(image.compareImageTimestamp)
                  .toISOString()
                  .split('T')[0]
              : null
            const [createdAt] = new Date(image.createdAt)
              .toISOString()
              .split('T')

            const queryParams = [
              'showDuplicates=true',
              `filterCommit=${post}%2C${pre}`,
              'addToCompare=true',
              `startDate=${compareImageTimestamp || createdAt}`,
              `endDate=${createdAt}`
            ].join('&')
            const webshotUrl = `${host}/project/dashboard/${image.project}/blob/${path}?${queryParams}`
            link = `[Webshot Archive ${post}...${pre}](${webshotUrl})`
          }
          return [
            `| ![${image.originalName}](${url})    | ![${image.originalName}](${diffUrl})|`,
            `| ${image.path}                       | ${image.diffCount}px / ${image.diffCommitSha?.substring(0, 10)} / ${link} |`
          ].join('\n')
        }
        core.debug(`Unknown image: ${image.originalName}`)
        return ''
      })
      .join('\n')

    const table = `
| Image |  Diff |
| ----- | ----- |
${tableRows}
    `

    const body = `
${COMMENT_IDENTIFIER}

${message ? `${message}\n\n` : ''}
${images.length ? '## Uploaded Images' : ''}

${images.length ? table : ''}
    `

    await createOrUpdateComment({
      repo: context.repo,
      issue_number: context.issue.number,
      body,
      projectId,
      clientId,
      clientSecret
    })
  } catch (error) {
    core.debug(error)
    core.info(`
Error: make sure you have the correct permissions on your workflow file;
permissions:
  contents: write
  pull-requests: write
      `)
    core.setFailed(`Failed to create or update comment: ${error.message}`)
  }
}

module.exports = { comment }
