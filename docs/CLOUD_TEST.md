# Run the five-hour test while your computer is off

The **Five-hour learning test** GitHub Action runs on GitHub's Linux computers.
It uses the same optimized long-learning profile as Settings: three students,
planner on, low reasoning for all roles, six exam workers, request recovery,
verification every cycle, exams every two cycles and a final-exam reserve.
Normal website runs are unchanged.

## One-time setup

1. Put only `.github/workflows/learning-test.yml` on `main` to register the launcher.
   The experiment code can remain on `codex/muse-throughput`; it does not need to merge.
2. Open **Settings → Secrets and variables → Actions → New repository secret**.
   Name it **MODEL_API_KEY**, and paste your Muse key as the secret value.
   Never put it in source code, a workflow input, a commit or a chat.
3. Check Actions is enabled and runner minutes and artifact storage are available.
   Standard runners are free for public repositories; private repositories use
   the owner's allowance. Muse usage is still paid. The workflow uses our existing
   Contributor model and estimated token prices; update these if prices change.

## Run and download

1. Open **Actions → Five-hour learning test → Run workflow**.
2. Leave **Use workflow from** on `main`. Set **Branch or commit to test** to
   `codex/muse-throughput` (the default), choose a Muse budget above $0 and at most
   $20 (default $20), then click **Run workflow**. The launcher checks out that
   branch's experiment code without merging it into `main`.
3. Once GitHub shows the job running, you can close the browser and shut down
   your computer. Progress appears in the **Run the classroom** step's logs.
4. Download **learning-results-…** under **Artifacts** on the completed run's page.
   Results expire after seven days, so download a copy.

The ZIP contains `SUMMARY.md`, `CLASSROOM-REPORT.md` when a final snapshot exists,
the run configuration, spending ledger and baseline, teaching, exam and final
JSON checkpoints, including saved lessons, recorded moves and retained conversations.
It excludes the API key and `.env`. Give this archive to Codex for analysis.
Cloud results do not automatically appear in your local website.

## Limits and failures

New calls stop at five hours or the estimated budget, whichever comes first.
Active calls can take longer to drain. Extra time is reserved for saving and
uploading before GitHub's six-hour job limit. The summary explicitly reports
incomplete learning cycles and final exams; this is an exploratory test.

API errors mark the job failed and the upload step still runs. Hard runner loss
or force-cancellation can prevent upload; this is not continuously backed-up hosting.
Prefer the normal deadline over force-cancelling a job. Every dispatch or workflow
retry starts a fresh experiment and budget; it does not resume a previous job.

Only one cloud test runs at a time. Avoid simultaneous local or teammate tests
against the same team rate quota. Repository users with Actions access can read
the experiment data. Do not include private personal information in these tests.

No-cost configuration check:

```sh
node --import tsx scripts/cloud-learning.ts
```

Paid command used by the workflow (requires configured environment):

```sh
node --experimental-sqlite --import tsx scripts/cloud-learning.ts --live
```
