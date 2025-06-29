const core = require('@actions/core')
const github = require('@actions/github')
const { execSync } = require('child_process')

module.exports.getDefaultCommitSha = () => {
  let commitSha = ''
  if (github.context.eventName === 'pull_request') {
    commitSha = github.context.payload.pull_request.head.sha
  } else if (github.context.eventName === 'push') {
    commitSha = github.context.payload.after
  }
  return commitSha
}

module.exports.getDefaultCompareCommitSha = () => {
  if (github.context.eventName === 'pull_request') {
    // this is buggy.  the base.sha is not whats on the PR
    return github.context.payload.pull_request.base.sha
  }
  return github.context.payload.before // for push events
}

module.exports.getDefaultBranchName = () => {
  if (github.context.eventName === 'pull_request') {
    return github.context.payload.pull_request.head.ref
  }
  return github.context.ref.replace('refs/heads/', '')
}

module.exports.determineEventTypeAndMergedBranch = () => {
  try {
    let commitSha = ''
    if (process.env.COMMIT_SHA) {
      commitSha = process.env.COMMIT_SHA
    } else if (github.context.eventName === 'pull_request') {
      commitSha = github.context.payload.pull_request.head.sha
      core.debug(`PR head SHA: ${commitSha}`)
    } else {
      commitSha = github.context.sha
      core.debug(`Push event SHA: ${commitSha}`)
    }
    core.debug(`Checking commit: ${commitSha}`)

    const eventName = github.context.eventName
    let mergedBranch = ''

    if (github.context.eventName === 'pull_request') {
      core.debug('This is a pull_request')
      // Always treat PR events as pushes
    } else if (github.context.eventName === 'push') {
      // For push events, check if it's a merge between any branches
      const parentsOutput = execSync(`git rev-list --parents -n 1 ${commitSha}`)
        .toString()
        .trim()
      const parents = parentsOutput.split(' ').slice(1) // Remove the commit SHA itself

      if (parents.length > 1) {
        core.info('This is a merge between branches')

        // Get the second parent hash
        const secondParent = parents[1]
        try {
          const branchName = execSync(
            `git name-rev --name-only ${secondParent}`
          )
            .toString()
            .trim()
          // Remove 'remotes/origin/' prefix if present
          mergedBranch = branchName.replace('remotes/origin/', '')
        } catch (error) {
          core.warning(`Could not determine branch name: ${error.message}`)
          mergedBranch = 'unknown'
        }
      } else {
        core.info('This is a push')
      }
    } else {
      core.info(`this is a ${github.context.eventName}`)
    }

    // Set outputs (equivalent to >> $GITHUB_ENV)
    // core.exportVariable('EVENT_TYPE', eventType)
    // core.exportVariable('MERGED_BRANCH', mergedBranch)

    return { eventName, mergedBranch }
  } catch (error) {
    core.setFailed(`Error determining event type: ${error.message}`)
    throw error
  }
}

module.exports.getDefaultComment = () => {
  return github.context.eventName === 'pull_request' ? 'true' : ''
}
