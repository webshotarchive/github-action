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
    const bodyString = JSON.stringify({
      repo,
      issueNumber: issue_number,
      comment: body
    })
    const response = await fetch(
      `https://api.webshotarchive.com/api/github/actions/comment/${projectId}`,
      {
        method: 'POST',
        body: bodyString,
        headers: {
          'x-client-id': clientId,
          'x-client-secret': clientSecret,
          'Content-Type': 'application/json'
        }
      }
    )
    const data = await response.json()
    if (data?.status === 200 || data?.status === 201) {
      core.info('Comment created or updated')
    } else {
      core.info('Comment not created or updated')

      core.info(`body: ${bodyString}`)
      core.info(`projectId: ${projectId}`)

      core.setFailed(`Failed to create or update comment: ${data.message}`)
    }
  } catch (error) {
    core.info(error)
  }
}
const comment = async ({
  images,
  message,
  commitSha,
  failedTestRegex = /failed/,
  projectId,
  clientId,
  clientSecret
}) => {
  try {
    const context = github.context

    const tableRows = images
      .filter(image => !!image)
      .map(image => {
        const url = `${STATIC_IMAGE_HOST}/api/image/id/${image.uniqueId}.png`
        const diffUrl = `${STATIC_IMAGE_HOST}/api/image/id/${image.uniqueId}.diff.png`
        const path = image.path
        const name = image.originalName
        const diffPx = image.diffCount || 0
        const commit = image.diffCommitSha?.substring(0, 10) || ''
        const post = commitSha?.substring(0, 10) || ''
        const pre = image.diffCommitSha?.substring(0, 10) || ''
        const host = 'https://www.webshotarchive.com'

        // Failed case
        if (failedTestRegex.test(image.path)) {
          return `<!--failed test --><tr>
              <td colspan="2"><img src="${url}" width="350"/></td>
            </tr>
            <tr>
              <td colspan="2">
                <sub>
                  <b>${path}</b><br>
                  <b>Status:</b> <span style="color: #d73a49;">Failed test</span>
                </sub>
              </td>
            </tr>`
        } else if (image.originalName && image.error) {
          const compareImage = image.metadata?.compareImage
          let link = ''

          const compareImageTimestamp = image.metadata?.compareImageTimestamp
            ? new Date(image.metadata?.compareImageTimestamp)
                .toISOString()
                .split('T')[0]
            : null
          core.debug(`path: ${path}`)
          core.debug(`compareImageTimestamp: ${compareImageTimestamp}`)
          const [createdAt] = new Date(image.createdAt).toISOString().split('T')
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
          link = `<a href="${webshotUrl}">Webshot Archive ${post}...${pre}</a>`
          const compareSrc = `${STATIC_IMAGE_HOST}/api/image/id/${compareImage}.png`

          return `<!-- compare image with error--><tr>
              <td><img src="${url}" width="350"/></td>
              <td><img src="${compareSrc}" width="350"/></td>
            </tr>
            <tr>
              <td colspan="2">
                <sub>
                  <b>${path}</b><br>  
                  <b>Error:</b> ${image.error}<br>
                  <b>Diff:</b> ${diffPx}px<br>
                  <b>Commit:</b> ${commit}<br>
                  ${link}
                </sub>
              </td>
            </tr>`
        } else if (image.error) {
          return `<!-- compare image with error--><tr>
          <td colspan="2">${image.error}</td>
          </tr>`
        } else if (!image.diffCount) {
          return `<!-- New image --><tr>
              <td colspan="2"><img src="${url}" /></td>
            </tr>
            <tr>
              <td colspan="2">
                <sub>
                  <b>${path}</b><br>
                  <b>Status:</b> <span style="color: #28a745;">New image</span>
                </sub>
              </td>
            </tr>`
        } else if (image.diffCount > 0) {
          let link = ''
          if (image.diffCommitSha && commitSha) {
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
            link = `<a href="${webshotUrl}">Webshot Archive ${post}...${pre}</a>`

            return `<!-- diff found for ${path} --><tr>
              <td><img src="${url}" width="350"/></td>
              <td><img src="${diffUrl}" width="350"/></td>
            </tr>
            <tr>
              <td colspan="2">
                <sub>
                  <b>${path}</b><br>
                  <b>Diff:</b> ${diffPx}px<br>
                  <b>Commit:</b> ${commit}<br>
                  ${link}
                </sub>
              </td>
            </tr>`
          }
        }

        // Diff case
        return `<!-- no diff found for ${path} -->`
      }).join(`
        <tr style="height: 10px; background-color: #f6f8fa;">
          <td colspan="2"></td>
        </tr>
      `)
    const table = `
<table>
  <tr>
    <th>Image</th>
    <th>Diff</th>
  </tr>
  ${tableRows}
</table>
    `

    const body = `
${COMMENT_IDENTIFIER}

${message ? `${message}\n\n` : ''}
${images.length ? '## Uploaded Images' : ''}

${images.length ? table : ''}
    `

    await createOrUpdateComment({
      repo: `${context.repo.owner}/${context.repo.repo}`,
      issue_number: context.issue.number,
      body,
      projectId,
      clientId,
      clientSecret
    })
    return body
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

module.exports = { comment, createOrUpdateComment }
