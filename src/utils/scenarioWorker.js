/**
 * Web Worker wrapper for scenarioCalculator.js
 * Runs heavy calculation off the main thread to prevent "Page Unresponsive"
 */
import { runScenarioAnalysis } from './scenarioCalculator'

self.onmessage = function (e) {
    try {
        const params = e.data
        const result = runScenarioAnalysis(params)
        self.postMessage({ success: true, result })
    } catch (err) {
        self.postMessage({ success: false, error: err.message || 'Unknown error' })
    }
}
