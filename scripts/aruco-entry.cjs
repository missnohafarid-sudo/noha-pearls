// Entry for scripts/vendor-aruco.mjs. The dictionary registers itself on `AR`.
const { AR } = require('js-aruco2');
require('js-aruco2/src/dictionaries/aruco_4x4_1000.js');

module.exports = { AR };
