// Role-based access control middleware factory
function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires one of [${roles.join(', ')}]` });
    }
    next();
  };
}

// Read-only roles — can view dashboards but not mutate
const READ_ONLY_ROLES = ['regional_officer', 'district_officer'];
const NATIONAL_ROLES  = ['national_admin', 'national_officer'];
const ADMIN_ONLY      = ['national_admin'];
const FIELD_ROLES     = ['aea', 'distributor', 'sp_operator', 'farmer'];

module.exports = { allow, READ_ONLY_ROLES, NATIONAL_ROLES, ADMIN_ONLY, FIELD_ROLES };
