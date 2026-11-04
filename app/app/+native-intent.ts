export function redirectSystemPath({ path }: { path: string }): string {
  return path.includes('oauthredirect') ? '/login' : path;
}
