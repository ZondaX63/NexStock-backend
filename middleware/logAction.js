const Log = require('../models/Log');
module.exports = async function logAction({ user, action, module, targetId, targetName, message, company }) {
  await Log.create({ user, action, module, targetId, targetName, message, company });
}; 