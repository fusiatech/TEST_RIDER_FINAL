/**
 * Sample Theme Extension
 * 
 * This is a minimal extension entry point demonstrating
 * the extension activation lifecycle.
 */

module.exports = {
  activate(context) {
    console.log('[sample-theme] Extension activated')
    
    return {
      getTheme() {
        return require('./theme.json')
      }
    }
  },
  
  deactivate() {
    console.log('[sample-theme] Extension deactivated')
  }
}
