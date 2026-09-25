# Joining Eagle Ring

Eagle Ring is a webring for Houston City College CS students and alumni. It has two parts:

- the **Directory**, a public page that lists every Member's personal website, grouped by Graduation Year;
- the **Ring Widget**, a small block of links you can add to your own site. It sends visitors to the previous, next or a random Member's site.

This guide takes you from nothing to listed. You don't need to have used git before. Every step can be done in your web browser on github.com.

A few words used below:

- **Member**: someone listed in the Directory.
- **Site**: your personal website, the thing the Directory links to.
- **Graduation Year**: the year you graduated, expect to graduate, or left the School.
- **Standing**: an optional note on how you relate to the School (graduated, transferred or attended).
- **Submission**: the pull request (explained below) that adds or edits your record.
- **Maintainer**: the person who reviews and accepts Submissions. Right now that's John Pierre, [@jpierre-7](https://github.com/jpierre-7).
- **the School**: Houston City College.

## Contents

1. [Who can be a Member](#1-who-can-be-a-member)
2. [What you need first](#2-what-you-need-first)
3. [Steps to join](#3-steps-to-join)
4. [Every field and its rules](#4-every-field-and-its-rules)
5. [What CI checks](#5-what-ci-checks)
6. [Adding the Ring Widget](#6-adding-the-ring-widget)
7. [Editing your record or leaving](#7-editing-your-record-or-leaving)
8. [Contacting the Maintainer](#8-contacting-the-maintainer)

## 1. Who can be a Member

Anyone who takes or took CS classes at Houston City College.

- You don't need a degree from the School. If you transferred to another school, you count.
- Current students count too.
- Nobody checks your transcript. It works on trust. The Maintainer looks at your Site before accepting it.

## 2. What you need first

- **A Site that starts with `https://`.** It must be your own personal website. A free GitHub Pages site (like `https://yourname.github.io/`) is fine, and so is one in a subfolder (like `https://yourname.github.io/my-site/`). A profile page on another service (LinkedIn, X, your GitHub profile page) is not a Site.
- **A GitHub account.** It's free. Sign up at [github.com/signup](https://github.com/signup).

## 3. Steps to join

First, some words you'll see:

- **Repository (repo)**: a project's folder of files on GitHub, with its full history. Eagle Ring's repo is [github.com/jpierre-7/eagle-ring](https://github.com/jpierre-7/eagle-ring).
- **Fork**: your own copy of someone else's repo, under your account. You change your copy, then ask for your change to be copied back.
- **Commit**: a saved change to one or more files, with a short message saying what changed.
- **Pull request (PR)**: a request to the Maintainer to pull your change from your fork into the real repo. On Eagle Ring, your PR is your Submission.
- **CI (continuous integration)**: robot checks that run on every PR and report problems before a person looks at it.
- **YAML**: a simple text format of `field: value` lines. Your Member file is written in it.

### Step 1: Pick your slug

Your **slug** is a short ID for you, usually your name, like `kevin-tran`. It becomes your filename and appears in your Ring Widget links.

- 2 to 32 characters.
- Only lowercase letters `a` to `z` and digits `0` to `9`, in groups joined by single hyphens.
  - Good: `kevin-tran`, `jo`, `mary-jane-watson`, `ada2024`.
  - Not allowed: `Kevin-Tran` (capitals), `kevin_tran` (underscore), `kevin--tran` (two hyphens), `-kevin` or `kevin-` (hyphen at the start or end), `kevin.tran` (dot), `josé` (accented letter).
- **Choose carefully: your slug never changes after your Submission is merged**, because other Sites link to it.

### Step 2: Fork the repo

1. Sign in to GitHub.
2. Go to [github.com/jpierre-7/eagle-ring](https://github.com/jpierre-7/eagle-ring).
3. Click **Fork** near the top right, then **Create fork**.

You now have your own copy at `github.com/<your-username>/eagle-ring`. Do the next steps there.

### Step 3: Create your Member file

1. In your fork, open [`docs/member-example.yaml`](docs/member-example.yaml). Click the **Copy raw file** button (two overlapping squares) above the file to copy all of it.
2. Go back to the top of your fork and open the folder `src/content/members/`.
3. Click **Add file**, then **Create new file**.
4. In the name box, type your slug followed by `.yaml`, for example `kevin-tran.yaml`. The full path must be `src/content/members/<your-slug>.yaml`. Use `.yaml`, not `.yml`, and don't put it in a subfolder.
5. Paste the example into the big text box.

### Step 4: Fill it in

Change every value to your own. [Section 4](#4-every-field-and-its-rules) explains each field. You can delete the comment lines (the ones starting with `#`).

A finished file looks like this:

```yaml
name: Kevin Tran
site: https://kevintran.github.io/
graduationYear: 2023
github: kvtran
tagline: Data analyst. Plots things in R.
status: transferred
```

When you're done, click **Commit changes**, write a short message such as `Add kevin-tran`, and click **Commit changes** again.

### Step 5: Open your pull request

1. At the top of your fork, click **Contribute**, then **Open pull request**.
2. Check that the PR shows exactly one new file: yours.
3. The description box already holds three checkboxes. Tick each one by changing `[ ]` to `[x]`:
   - I take or took CS coursework at the School.
   - This Site is mine.
   - This PR changes only my Member file.
4. Under *Anything the Maintainer should know?*, add a note if you like, or leave it empty.
5. Click **Create pull request**.

### Step 6: Wait for CI and review

CI runs on your PR ([section 5](#5-what-ci-checks)). If a check fails, its message names the file and field. Fix the file in your fork (open it, click the pencil icon, edit, commit). The PR updates by itself and CI runs again.

The Maintainer then reviews your PR, looks at your Site, and merges it. **Merge** means your change is copied into the real repo. The Directory updates a few minutes later.

### Step 7 (optional): Add the Ring Widget

See [section 6](#6-adding-the-ring-widget).

### If you already use git

Fork, clone your fork, then:

```sh
git switch -c join/<your-slug>
cp docs/member-example.yaml src/content/members/<your-slug>.yaml
# edit the file
git add src/content/members/<your-slug>.yaml
git commit -m "Add <your-slug>"
git push -u origin join/<your-slug>
```

Then open a PR against `main` on `jpierre-7/eagle-ring`.

## 4. Every field and its rules

These rules are checked by code. If this page and the code ever disagree, the code wins. The rules live in [`src/lib/member.ts`](src/lib/member.ts) (the fields) and [`src/content.config.ts`](src/content.config.ts) (how Member files are loaded).

### The filename (your slug)

- The file goes directly in `src/content/members/`, not in a subfolder.
- It's named `<your-slug>.yaml`. It must end in `.yaml` (not `.yml`).
- The slug follows the rules in [Step 1](#step-1-pick-your-slug): 2 to 32 characters, lowercase letters and digits in groups joined by single hyphens.
- It never changes after your Submission is merged.

### `name` (required)

- Your name as you want it shown in the Directory. It can be a nickname.
- 1 to 60 characters. Spaces at the start and end are trimmed off.

### `site` (required)

- Your Site's address. It must start with `https://`.
- No query string (the part from `?`) and no fragment (the part from `#`).
- Subfolders are fine: `https://7jpierre.github.io/jp-website/`.
- It must be on a public domain name, with a dot in it. `https://localhost/` is not allowed.
- No username or password in the address (like `https://me:secret@example.com/`).
- No other Member can already have the same Site. Capital letters in the domain and a trailing `/` don't make it different.
- It can't be a page on a profile or social service. That means anything on `github.com`, social sites like LinkedIn, X, Instagram or YouTube, code hosts like GitLab or Codeberg, coding-profile sites like LeetCode or Kaggle, and link-in-bio pages like Linktree. A GitHub Pages site like `yourname.github.io` is fine. The full list is in [`scripts/submission/profile-hosts.ts`](scripts/submission/profile-hosts.ts).

### `graduationYear` (required)

- The year you graduated, expect to graduate, or left the School (for example, the year you transferred out).
- Still a student? Put your best guess. You can change it later.
- A whole number from 1990 to six years after the current year.
- Write it as a plain number, without quotes: `graduationYear: 2023`, not `graduationYear: "2023"`.

### `github` (required)

- Your GitHub username (handle), **without** the `@`: `github: kvtran`, not `github: "@kvtran"`.
- It follows GitHub's own rules: 1 to 39 letters, digits or single hyphens, not starting or ending with a hyphen.
- No other Member can already have the same handle, ignoring capital letters.
- It's shown in the Directory. It also decides who owns the record: changes to it are expected to come from this account (see [section 7](#7-editing-your-record-or-leaving)).
- If your handle is only digits (like `12345`), wrap it in double quotes: `github: "12345"`. Otherwise YAML reads it as a number and the check fails.

### `tagline` (optional)

- A short line about you, shown in the Directory.
- Plain text, one line, at most 80 characters.
- No HTML (like `<b>`), no Markdown links (like `[text](url)`), and no links or web addresses (nothing with `http://`, `https://` or `www.`).
- If you don't want one, delete the whole `tagline:` line. Don't leave it empty.

### `status` (optional): your Standing

- One of `graduated`, `transferred` or `attended`, written in lowercase. The Directory shows it as Graduated, Transferred or Attended.
  - `graduated`: you graduated from the School.
  - `transferred`: you moved to another school.
  - `attended`: you took classes and left without graduating or transferring.
- **Current students leave it out.** It's not allowed when your `graduationYear` is after the current year.
- If you don't want to set it, delete the whole `status:` line.

### No other fields

Only the six fields above are allowed. Any other field (a typo like `Name:` or `graduation_year:` counts) fails the check with "is not a Member field". Field names are case-sensitive.

### YAML tips

- Put a space after each colon: `name: Kevin Tran`.
- If a value contains `: ` (colon then space) or ` #`, wrap it in double quotes: `tagline: "Student: loves compilers"`.
- Indentation matters in YAML. Keep every line flush to the left.

## 5. What CI checks

When you open or update your PR, CI runs a check called **Submission checks**. You'll see it near the bottom of the PR page: a green tick passed, a red cross failed. Click **Details** next to it to see its summary, which says exactly what to fix.

**Blocking checks.** If any of these fail, the PR can't be merged until you fix it:

- **One file only.** Your PR changes **exactly one file** in `src/content/members/` **and nothing else**. The Maintainer's own PRs are exempt.
  - **Never rename your file.** A rename counts as deleting one Member file and adding another, which is two files. Your slug stays the same forever once it's merged.
- **Valid file.** The filename is a valid slug, the file is valid YAML, and every field follows [section 4](#4-every-field-and-its-rules).
- **Not a profile page.** Your `site` isn't on the list of profile and social services (see [`site`](#site-required)).
- **Not already taken.** Your `site` and `github` aren't already used by another Member.
- **The Directory still builds** with your file in it.

**The checks run from `main`, not from your PR.** Editing anything under `scripts/` or `.github/` won't change the result: a Submission that touches those folders fails with "This PR changes the checks themselves". If you think a check is wrong, [open an issue](https://github.com/jpierre-7/eagle-ring/issues/new) instead.

**Warning only: Site reachability.** CI tries to open your Site once. If it can't, you'll see a warning, not a failure. Some Sites block robots or are slow to wake up, so this can happen even when your Site works fine. The Maintainer checks it by hand and decides.

**"Needs Maintainer approval".** If your PR edits or deletes a record that already exists, and your GitHub account isn't the one in that record's `github` field, the check's summary says the PR needs Maintainer approval. This covers someone editing another person's record, and a Member who renamed their GitHub account. It never fails the check. It means the Maintainer will check with the owner before merging. If you renamed your GitHub account, say so in your PR description.

The first time you open a PR, GitHub may wait for the Maintainer to approve running CI at all. That's a normal GitHub safety step for new contributors.

**Running the check yourself (optional, for git users).** You need Node.js 22.18 or newer. From your clone, commit your file first (the check reads commits, not unsaved changes), then run:

```sh
npm ci
npm run check:submission -- --author <your-github-handle>
```

It compares your commit with `origin/main`. If your fork is behind, sync it first. Add `--no-fetch` to skip opening your Site.

## 6. Adding the Ring Widget

This step is optional, and you can do it any time after your Submission is merged. The Ring Widget is a small block of links for your Site: **Previous**, **Eagle Ring** (the Directory), **Random** and **Next**. It's plain HTML, with no scripts and no files to host.

**Replace every `SLUG` with your slug.** It appears three times in each snippet. For `kevin-tran`, `.../ring/SLUG/prev` becomes `.../ring/kevin-tran/prev`, and `random?from=SLUG` becomes `random?from=kevin-tran`.

Paste it into your Site's HTML where you want it to appear, often the footer.

### Snippet A: default (plain links)

Use this one unless you want the styled version. It has no styling of its own, so it takes on your Site's look.

```html
<nav class="eagle-ring" aria-label="Eagle Ring webring">
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/prev">&larr; Previous</a>
  <a href="https://jpierre-7.github.io/eagle-ring/">Eagle Ring</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/random?from=SLUG">Random</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/next">Next &rarr;</a>
</nav>
```

### Snippet B: optional styled version

This one keeps your Site's font and text colour, lays the links out in a row, and adds a yellow line on top, yellow underlines and a yellow outline when a link is selected with the keyboard. It also undoes any styles your Site applies to every `nav` or link, so the widget looks the same everywhere.

```html
<style>
.eagle-ring{all:unset;display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem 1.25rem;margin:2rem 0;padding:.75rem 0 0;border-top:3px solid #facc15;font:inherit;color:inherit}
.eagle-ring a{all:unset;cursor:pointer;color:inherit;text-decoration:underline;text-decoration-color:#facc15;text-decoration-thickness:2px;text-underline-offset:3px}
.eagle-ring a::before,.eagle-ring a::after{content:none}
.eagle-ring a:focus-visible{outline:3px solid #facc15;outline-offset:2px}
.eagle-ring .er-home{font-weight:800}
</style>
<nav class="eagle-ring" aria-label="Eagle Ring webring">
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/prev">&larr; Previous</a>
  <a class="er-home" href="https://jpierre-7.github.io/eagle-ring/">Eagle Ring</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/random?from=SLUG">Random</a>
  <a href="https://jpierre-7.github.io/eagle-ring/ring/SLUG/next">Next &rarr;</a>
</nav>
```

The links work from the moment your Submission is merged. When Members join or leave, your neighbours change on their own. You never need to edit the widget.

## 7. Editing your record or leaving

### Editing

Open a new PR that changes your own file, from the GitHub account named in its `github` field. The steps are the same as joining, but you open your existing file in `src/content/members/` and click the pencil icon instead of creating a new file. (If your fork is old, click **Sync fork** on your fork's page first.)

- You can change any field, including `github` if you renamed your GitHub account. In that case CI flags the PR "needs Maintainer approval", which is expected.
- You can't change your slug (the filename).
- Students: update `graduationYear` if your plans change, and add `status` once your Graduation Year arrives if you want to.

### Leaving

- Open a PR that deletes your file: open it in your fork, click the **...** menu, choose **Delete file**, commit, and open a PR.
- If you don't use git, [open an issue](https://github.com/jpierre-7/eagle-ring/issues/new) asking to be removed instead.
- Take the Ring Widget off your Site. If you forget, its links still work: they send visitors on to the right neighbours.

### When the Maintainer removes a record

The Maintainer only removes a record when the Site has been down for 30 days or more, its content is inappropriate, or the Member isn't eligible. They'll @-mention you on the removal PR.

## 8. Contacting the Maintainer

- For questions or problems, [open an issue](https://github.com/jpierre-7/eagle-ring/issues/new) on the repo. An **issue** is a public discussion thread on GitHub.
- To get the Maintainer's attention on a PR or issue, mention [@jpierre-7](https://github.com/jpierre-7) in a comment.
