const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

const vaultAuth = (req, res, next) => {
  const token = req.header('x-vault-token');
  if (!token) return res.status(401).json({ msg: 'No vault token, access denied' });

  try {
    const decoded = jwt.verify(token, process.env.VAULT_SECRET);
    req.vaultUser = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Vault token is not valid or expired' });
  }
};

module.exports = { auth, vaultAuth };
