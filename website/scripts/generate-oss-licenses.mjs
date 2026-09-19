import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.dirname(scriptDirectory)
const repositoryRoot = path.dirname(websiteRoot)
const lockfilePath = path.join(repositoryRoot, 'package-lock.json')
const outputPath = path.join(websiteRoot, 'lib/oss-licenses.generated.ts')

const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'))
const websitePackage = lockfile.packages?.website
if (!websitePackage) {
  throw new Error('The website workspace is missing from package-lock.json')
}

function packagePathFor(parentPath, dependencyName) {
  let currentPath = parentPath
  while (true) {
    const candidate = currentPath
      ? `${currentPath}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`
    if (lockfile.packages[candidate]) return candidate
    if (!currentPath) break
    const parent = path.posix.dirname(currentPath)
    currentPath = parent === '.' ? '' : parent
  }
  throw new Error(
    `Cannot resolve ${dependencyName} from ${parentPath} in package-lock.json`,
  )
}

function packageDirectory(packagePath) {
  return path.join(repositoryRoot, ...packagePath.split('/'))
}

function declaredLicense(packageJson) {
  if (typeof packageJson.license === 'string') return packageJson.license
  if (packageJson.license && typeof packageJson.license.type === 'string') {
    return packageJson.license.type
  }
  if (Array.isArray(packageJson.licenses)) {
    return packageJson.licenses
      .map((license) => (typeof license === 'string' ? license : license?.type))
      .filter(Boolean)
      .join(' OR ')
  }
  return 'License not declared in package.json'
}

function licenseText(packageDirectoryPath, license) {
  const candidates = fs
    .readdirSync(packageDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /license|copying|notice/i.test(name))
    .toSorted((left, right) => {
      const leftScore = /^license(?:\.|$)/i.test(left) ? 0 : 1
      const rightScore = /^license(?:\.|$)/i.test(right) ? 0 : 1
      return leftScore - rightScore || left.localeCompare(right)
    })

  for (const candidate of candidates) {
    const text = fs.readFileSync(
      path.join(packageDirectoryPath, candidate),
      'utf8',
    )
    if (text.trim()) return text.trim()
  }

  return `License declared by package.json: ${license}`
}

const packages = new Map()
const pending = Object.entries(websitePackage.dependencies ?? {}).map(
  ([name, dependency]) => ({
    name,
    dependency,
    parentPath: 'website',
    optional: false,
  }),
)

while (pending.length > 0) {
  const current = pending.pop()
  if (!current) continue
  const packagePath = packagePathFor(current.parentPath, current.name)
  const packageDirectoryPath = packageDirectory(packagePath)
  const packageJsonPath = path.join(packageDirectoryPath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    if (current.optional) continue
    throw new Error(`Installed package is missing: ${packageJsonPath}`)
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const key = `${packageJson.name}@${packageJson.version}`

  if (!packages.has(key)) {
    const license = declaredLicense(packageJson)
    packages.set(key, {
      name: packageJson.name,
      version: packageJson.version,
      license,
      text: licenseText(packageDirectoryPath, license),
    })
  }

  const lockPackage = lockfile.packages[packagePath] ?? {}
  for (const [name, dependency] of Object.entries(
    lockPackage.dependencies ?? {},
  )) {
    pending.push({ name, dependency, parentPath: packagePath, optional: false })
  }
  for (const [name, dependency] of Object.entries(
    lockPackage.optionalDependencies ?? {},
  )) {
    pending.push({ name, dependency, parentPath: packagePath, optional: true })
  }
}

const licenses = [...packages.values()].toSorted(
  (left, right) =>
    left.name.localeCompare(right.name) ||
    left.version.localeCompare(right.version),
)

const output = `// website/scripts/generate-oss-licenses.mjsによる生成物のため、直接編集しない。\nexport interface OssLicense {\n  readonly name: string\n  readonly version: string\n  readonly license: string\n  readonly text: string\n}\n\n// oxfmt-ignore\nexport const ossLicenses: readonly OssLicense[] = ${JSON.stringify(licenses, null, 2)}\n`

fs.writeFileSync(outputPath, output)
console.log(
  `Generated ${licenses.length} OSS license entries at ${path.relative(repositoryRoot, outputPath)}`,
)
