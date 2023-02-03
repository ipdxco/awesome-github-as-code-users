
import { octokit } from './octokit.js';
import * as config from './config.js';

async function main() {
  let orgs = process.argv.slice(2);
  if (orgs.length === 0) {
    orgs = config.orgs
  }

  // Initiate all the syncs
  for (const org of orgs) {
    console.log(`Syncing ${org}...`)
    const response = await octokit.rest.actions.createWorkflowDispatch({
      owner: org,
      repo: 'github-mgmt',
      workflow_id: 'sync.yml',
      ref: 'master'
    })
    if (response.status !== 204) {
      console.error(`Failed to sync ${org}: ${response.status}`)
      process.exit(1)
    } else {
      console.log(`${org} sync initiated`)
    }
  }

  // Sleep for 60 seconds to allow the workflows to start
  console.log('Waiting for workflows to start for 60s...')
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Find latest sync workflow runs and wait for them to complete
  for (const org of orgs) {
    console.log(`Waiting for ${org} sync to complete...`)
    const response = await octokit.rest.actions.listWorkflowRuns({
      owner: org,
      repo: 'github-mgmt',
      workflow_id: 'sync.yml',
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

    // Wait for the workflow run to complete, sleep for 60 seconds between checks
    while (workflowRun.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 60000));
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
      console.error(`Sync failed for ${org}: ${workflowRunUrl}`)
      process.exit(1)
    } else {
      console.log(`Sync completed for ${org}: ${workflowRunUrl}`)
    }
  }

  console.log('All syncs completed successfully')
}

main();
