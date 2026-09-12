import type { ApplicationDefinition } from '@loutrejs/loutre'
import { createEventsMessagePortDefinition } from './index.js'

const application: ApplicationDefinition = createEventsMessagePortDefinition()

export default application
