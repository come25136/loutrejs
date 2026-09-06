import type { ApplicationDefinition } from '@loutrejs/loutre'
import { createEventsHttpDefinition } from './index.js'

const application: ApplicationDefinition = createEventsHttpDefinition()

export default application
