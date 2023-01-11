import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';

if (! process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environmental variable not set. It is required.')
}

const RetryableOctokit = Octokit.plugin(retry, throttling);

const octokit = new RetryableOctokit({
    auth: process.env.GITHUB_TOKEN,
    throttle: {
      onRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );

        // retry forever
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`
        );

        // retry forever
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      },
    },
});

export { octokit };
