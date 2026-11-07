import { PACKAGE_NAME, TYPERT_REMOTE } from './remote.js'

export const TYPERT = Object.freeze({
  package: PACKAGE_NAME,
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: TYPERT_REMOTE.descriptors,
})

export default TYPERT
