#!/usr/bin/env node

import { assertSupportedBunVersion } from '@loutrejs/loutre/runtime'

assertSupportedBunVersion()

const { runCreateLoutre } = await import('../dist/cli.js')

process.exitCode = await runCreateLoutre(process.argv.slice(2))
