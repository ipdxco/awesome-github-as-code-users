
import { octokit } from './octokit.js';
import * as config from './config.js';

async function main() {
  let orgs = process.argv.slice(2);
  if (orgs.length === 0) {
    orgs = config.orgs
  }

  // Initiate all the upgrades
  for (const org of orgs) {
    console.log(`Upgrading ${org}...`)
    const response = await octokit.rest.actions.createWorkflowDispatch({
      owner: org,
      repo: 'github-mgmt',
      workflow_id: 'upgrade.yml',
      ref: 'master'
    })
    if (response.status !== 204) {
      console.error(`Failed to upgrade ${org}: ${response.status}`)
      process.exit(1)
    } else {
      console.log(`${org} upgrade initiated`)
    }
  }

  // Sleep for 60 seconds to allow the workflows to start
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Find latest upgrade workflow runs and wait for them to complete
  for (const org of orgs) {
    console.log(`Waiting for ${org} upgrade to complete...`)
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: org,
      repo: 'github-mgmt',
      workflow_id: 'upgrade.yml',
      per_page: 1
    })
    if (response.status !== 200) {
      console.error(`Failed to list workflow runs for ${org}: ${response.status}`)
      process.exit(1)
    }
    let workflowRun = response.data.workflow_runs[0]
    const workflowRunId = workflowRun.id
    const workflowRunUrl = workflowRun.html_url
    console.log(`Waiting for ${workflowRunUrl} to complete...`)

    // Wait for the workflow run to complete, sleep for 10 seconds between  checks
    while (workflowRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const response = await octokit.rest.actions.getWorkflowRun({
        owner: org,
        repo: 'github-mgmt',
        run_id: workflowRunId
      })
      if (response.status !== 200) {
        console.error(`Failed to get workflow run for ${org}: ${response.status}`)
        process.exit(1)
      }
      workflowRun = response.data
    }

    // Exit if the workflow run failed
    if (workflowRun.conclusion !== 'success') {
      console.error(`Upgrade failed for ${org}: ${workflowRunUrl}`)
      process.exit(1)
    } else {
      console.log(`Upgrade completed for ${org}: ${workflowRunUrl}`)
    }
  }

  // Find all PRs created by upgrade workflows, they will use master-upgrade as the head branch
  const prs = []
  for (const org of orgs) {
    console.log(`Finding PRs for ${org}...`)
    const response = await octokit.rest.pulls.list({
      owner: org,
      repo: 'github-mgmt',
      state: 'open',
      head: 'master-upgrade',
      per_page: 1
    })
    if (response.status !== 200) {
      console.error(`Failed to list PRs for ${org}: ${response.status}`)
      process.exit(1)
    } else {
      console.log(`Found ${response.data.length} PRs for ${org}`)
    }
    prs.push(...response.data)
  }

  // Wait for all the checks to complete on all the PRs
  for (const pr of prs) {
    console.log(`Waiting for checks to complete on ${pr.html_url}...`)
    let checks = await octokit.rest.checks.listForRef({
      owner: pr.base.repo.owner.login,
      repo: pr.base.repo.name,
      ref: pr.head.ref,
      per_page: 100
    })
    if (checks.status !== 200) {
      console.error(`Failed to list checks for ${pr.html_url}: ${checks.status}`)
      process.exit(1)
    }

    // Sleep for 10 seconds between checks
    while (checks.data.check_runs.some(check => check.status !== 'completed')) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      checks = await octokit.rest.checks.listForRef({
        owner: pr.base.repo.owner.login,
        repo: pr.base.repo.name,
        ref: pr.head.ref,
        per_page: 100
      })
      if (checks.status !== 200) {
        console.error(`Failed to list checks for ${pr.html_url}: ${checks.status}`)
        process.exit(1)
      }
    }

    // Exit if any of the checks failed
    if (checks.data.check_runs.some(check => check.conclusion !== 'success')) {
      console.error(`Checks failed for ${pr.html_url}`)
      process.exit(1)
    } else {
      console.log(`Checks completed for ${pr.html_url}`)
    }
  }

  // Merge all the PRs
  for (const pr of prs) {
    console.log(`Merging ${pr.html_url}...`)
    const response = await octokit.rest.pulls.merge({
      owner: pr.base.repo.owner.login,
      repo: pr.base.repo.name,
      pull_number: pr.number,
      merge_method: 'squash'
    })
    if (response.status !== 200) {
      console.error(`Failed to merge ${pr.html_url}: ${response.status}`)
      process.exit(1)
    } else {
      console.log(`Merged ${pr.html_url}`)
    }
  }
}

main();
