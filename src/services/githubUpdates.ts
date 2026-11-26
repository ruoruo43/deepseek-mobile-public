const releasePage = 'https://github.com/ruoruo43/deepseek-mobile-public/releases/tag/'
const stableVersion = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
const nativeErrors = [
  'rateLimited',
  'notFound',
  'timeout',
  'networkError',
  'unavailable',
  'invalidRelease',
  'busy',
] as const

type NativeError = (typeof nativeErrors)[number]
export type GitHubUpdateError = NativeError | 'invalidInstalledVersion' | 'hostError'
export type GitHubUpdateResult =
  | { status: 'available'; tag: string; url: string; downloadAvailable?: true }
  | { status: 'current'; tag: string }
  | { status: GitHubUpdateError }

const parseVersion = (version: string) =>
  version.length < 64 ? stableVersion.exec(version)?.slice(1).map(BigInt) : undefined

export function parseGitHubUpdateResult(
  installedVersion: string | null,
  result: unknown
): GitHubUpdateResult {
  if (typeof result !== 'object' || result === null || !('status' in result)) {
    return { status: 'invalidRelease' }
  }
  const error = nativeErrors.find((status) => status === result.status)
  if (error) {
    return { status: error }
  }

  if (
    result.status !== 'release' ||
    !('tag' in result) ||
    typeof result.tag !== 'string' ||
    !result.tag.startsWith('v')
  ) {
    return { status: 'invalidRelease' }
  }
  const { tag } = result
  const release = parseVersion(tag.slice(1))
  if (!release) {
    return { status: 'invalidRelease' }
  }

  const installed = installedVersion && parseVersion(installedVersion.replace(/^v/, ''))
  if (!installed) {
    return { status: 'invalidInstalledVersion' }
  }

  const component = release.findIndex((value, index) => value !== installed[index])
  return component !== -1 && release[component] > installed[component]
    ? {
        status: 'available',
        tag,
        url: releasePage + tag,
        ...('downloadAvailable' in result && result.downloadAvailable === true
          ? { downloadAvailable: true }
          : {}),
      }
    : { status: 'current', tag }
}
