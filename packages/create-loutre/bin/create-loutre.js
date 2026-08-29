#!/usr/bin/env node

import { runCreateLoutre } from '../dist/cli.js'

process.exitCode = await runCreateLoutre(process.argv.slice(2))
