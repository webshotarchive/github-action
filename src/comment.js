const core = require('@actions/core')
const github = require('@actions/github')
const STATIC_IMAGE_HOST = 'https://cdn.webshotarchive.dev'
const COMMENT_IDENTIFIER = '<!-- Webshot Archive Uploaded Images Comment -->'

const createOrUpdateComment = async ({
  repo,
  issueNumber,
  images,
  message,
  projectId,
  clientId,
  clientSecret
}) => {
  try {
    const bodyString = JSON.stringify({
      repo,
      issueNumber,
      images,
      message
    })
    const response = await fetch(
      `https://api.webshotarchive.com/api/github/actions/comment/v2/${projectId}`,
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
  projectId,
  clientId,
  clientSecret
}) => {
  try {
    const context = github.context

    const result = await createOrUpdateComment({
      repo: `${context.repo.owner}/${context.repo.repo}`,
      issueNumber: context.issue.number,
      images,
      message,
      commitSha,
      projectId,
      clientId,
      clientSecret
    })
    return result
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
