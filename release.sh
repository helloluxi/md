#!/bin/sh

set -eu

die() {
  printf 'release: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '%s\n' "$*"
}

repo_root=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$repo_root"

for command_name in git node npm gh; do
  command -v "$command_name" >/dev/null 2>&1 || die "required command not found: $command_name"
done

[ -f package.json ] || die "package.json not found at repository root"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a Git repository"

package_name=$(node -p "require('./package.json').name || ''")
version=$(node -p "require('./package.json').version || ''")
[ -n "$package_name" ] || die "package.json must define name"
[ -n "$version" ] || die "package.json must define version"

case "$version" in
  *[!0-9A-Za-z.+-]*) die "package version contains unsupported characters: $version" ;;
esac

tag="v$version"
remote=${RELEASE_REMOTE:-origin}
branch=$(git symbolic-ref --quiet --short HEAD) || die "releases must be created from a branch, not detached HEAD"
commit=$(git rev-parse HEAD)

log "Checking repository and GitHub authentication..."
[ -z "$(git status --porcelain --untracked-files=normal)" ] || die "working tree is not clean; commit or stash changes first"
git remote get-url "$remote" >/dev/null 2>&1 || die "Git remote not found: $remote"
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not authenticated; run: gh auth login"
git fetch --quiet --tags "$remote"

remote_ref="refs/remotes/$remote/$branch"
git show-ref --verify --quiet "$remote_ref" || die "branch has no matching remote branch: $remote/$branch"
remote_commit=$(git rev-parse "$remote_ref")
[ "$commit" = "$remote_commit" ] || die "HEAD must exactly match $remote/$branch; push or synchronize the branch first"

if git show-ref --verify --quiet "refs/tags/$tag"; then
  tag_commit=$(git rev-list -n 1 "$tag")
  [ "$tag_commit" = "$commit" ] || die "tag $tag already points to a different commit"
fi

if gh release view "$tag" >/dev/null 2>&1; then
  die "GitHub release already exists: $tag"
fi

log "Type-checking package..."
npm run check

package_slug=$(printf '%s' "$package_name" | sed 's/^@//; s#/#-#g')
release_dir="/tmp/$package_slug/releases/$tag"
artifact_name="$package_slug-$version.tgz"
artifact="$release_dir/$artifact_name"
mkdir -p "$release_dir"

log "Building package..."
npm run build

log "Packaging release archive..."
npm pack --ignore-scripts --pack-destination "$release_dir" >/dev/null
[ -f "$artifact" ] || die "npm did not produce the expected archive: $artifact"
log "Created $artifact"

if ! git show-ref --verify --quiet "refs/tags/$tag"; then
  git tag -a "$tag" -m "$package_name $version"
fi

log "Pushing tag $tag..."
git push "$remote" "refs/tags/$tag"

log "Creating GitHub release $tag..."
release_url=$(gh release create "$tag" "$artifact#$artifact_name" --verify-tag --generate-notes --title "$package_name $tag")
log "Released $tag: $release_url"
