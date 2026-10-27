# Keyless Firebase CLI deployments

The local launcher signs in for one process, submits a Cloud Build job and watches its status. The job runs the standard Firebase CLI with an attached service account using Application Default Credentials (ADC). It never runs `firebase login` or downloads a service-account key.

## Storage boundary

No `.env`, `.firebaserc`, ADC JSON, saved Firebase login, service-account key, token argument or project-specific configuration file is created. Project and optional region are runtime arguments. Local OAuth credentials stay in process memory and are discarded at exit; another invocation requires sign-in again. Existing user login files are neither read nor modified. Cloud Build's CLI home/config/debug paths use `/dev/shm` RAM storage.

Google necessarily retains the service account and IAM policy, build specifications/status/logs, project identity and Hosting release history. This is **not zero cloud metadata retention**. The build specification also contains the public app assets. Credentials are not included in its specification or source. There are no secrets or custom environment values in the build request; runtime process settings only point CLI caches to RAM.

The upload uses an explicit allowlist of fourteen app/icon files plus the generic `firebase.json`. No repository archive, source bucket, manuscript, uploaded book, screenshot, `.env`, test fixture or private directory is sent. The source bundle is compressed and reconstructed in the build workspace. A changed static configuration with hooks or rewrites is rejected before sign-in.

## Prerequisites

- Node.js 22 or later locally.
- The official `firebase-tools@15.34.1` npm package. Pass its package directory, not the `firebase` executable. This pinned version is required because the memory-only OAuth adapter uses the CLI's internal authentication library. Review the adapter and tests before changing the version. No saved Firebase CLI login is needed.
- Billing linked to the target Google Cloud project. **The scripts cannot link or upgrade billing.** Build minutes/logging can incur charges; check current [Cloud Build pricing](https://cloud.google.com/build/pricing). The recipe selects `E2_STANDARD_2` in the default pool, subject to Google's free-tier terms.
- A project administrator for the one-time setup. Future submitters need `cloudbuild.builds.create/get`, project/billing-info read access, service-account read access and `iam.serviceAccounts.actAs` on the deployer. Keep submit access restricted: a submitter able to run arbitrary jobs as this account can exercise its Hosting permissions.

Install the official package using your package manager if unavailable; only dependency code is needed, never `firebase login`. A package manager may retain ordinary installation logs/cache. Do not include credentials in installation commands.

## One-time activation

1. Link billing yourself in the Google Cloud console if it is not already linked. Review any Google terms presented when enabling APIs.
2. Run the setup command with runtime arguments:

   ```sh
   node scripts/deploy-cloud.cjs --setup --project <project-id> --firebase-tools <firebase-tools-package-directory>
   ```

3. Open the printed Google sign-in URL in the browser and approve it yourself. The Firebase OAuth client requests broad Google Cloud scopes; the local session uses them for billing-status checks, API enablement and IAM setup. No credentials are saved. The Cloud Build deployment identity itself has only the roles below.

Setup checks billing **before any cloud mutation**, enables Cloud Build/IAM/Logging APIs and creates the `hosting-deployer` service account if absent. It grants these project roles to that account, preserving the existing IAM policy and conditions with an etag:

| Role | Purpose |
| --- | --- |
| Firebase Hosting Admin | Publish Hosting releases; this includes site administration |
| API Keys Viewer | Required by Firebase CLI for Hosting deployments |
| Logs Writer | Write ordinary Cloud Build output to Cloud Logging |

No Owner, Editor, Firebase Admin, Storage Admin, Token Creator or human-user role is granted. No keys, credential-generation APIs, repository connections, triggers or scheduled builds are created. Setup is idempotent. If a concurrent IAM edit causes a conflict, inspect/retry setup rather than overwriting the other edit. If setup fails partway through, inspect the APIs/account/policy before retrying; successful earlier steps may remain.

## Deploy

After IAM propagation, run:

```sh
node scripts/deploy-cloud.cjs --project <project-id> --firebase-tools <firebase-tools-package-directory>
```

The optional `--region <region>` chooses the build location; the default is `us-central1`. Choose the region on each invocation if changing it; it is never saved. Sign in for that invocation. The job installs the pinned CLI from npm and executes:

```sh
firebase deploy --only hosting --project <runtime-project-id> --non-interactive
```

The launcher uses the Cloud Build API for job submission/status. **Firebase CLI performs the Hosting deployment inside Google Cloud.** The attached account provides short-lived tokens through metadata/ADC. No token or key is passed from the local machine to the build.

`--check` performs only a billing-status check after sign-in; it is not a complete permission or deployment readiness check. A job is reported successful only when Cloud Build returns `SUCCESS`. A failed/uncertain job is never automatically resubmitted. If interrupted or timed out, inspect Cloud Build history before retrying: an already submitted build may continue running. The current live Hosting release remains until a successful replacement deployment.

## Verify and troubleshoot

```sh
node --test tests/cloud-deploy.test.cjs
node scripts/build-hosting.cjs
```

The tests reconstruct and byte-compare the upload, check that books/config files are excluded, validate shell substitutions, block mutations without billing, preserve IAM policies and exercise failed/uncertain submissions. These local checks do not replace the first real Cloud Build deployment.

If the build fails, inspect its logs in Cloud Build. Avoid debug logging or printing environment variables. Confirm the target account is attached, the three roles are present, APIs are enabled, IAM has propagated and the submitter has permission to act as the account. Do not fix authentication by creating/downloading a service-account key or running a persistent local login.

References: [Cloud Build service accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [Firebase CLI ADC support](https://firebase.google.com/docs/cli#use_the_cli_with_ci_systems), [Hosting roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product#hosting).
