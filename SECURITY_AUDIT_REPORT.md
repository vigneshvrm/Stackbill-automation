# Security Audit Report - StackBill Deployment Center

**Date:** 2026-01-29
**Scope:** Full codebase security review (excluding SSL implementation)
**Status:** Testing Phase

---

## Executive Summary

This security audit identified **27 vulnerabilities** across the StackBill Deployment Center application:

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 8 | Needs immediate attention |
| HIGH | 9 | Fix before production |
| MEDIUM | 7 | Fix in short-term |
| LOW | 3 | Fix when convenient |

**Overall Risk:** HIGH - The application lacks authentication/authorization and has multiple command injection vectors.

---

## Critical Findings Summary

### 1. No Authentication/Authorization (CRITICAL)
**All API endpoints are public.** Any user with network access can:
- Access any deployment session
- Export all credentials (MySQL, MongoDB, RabbitMQ, Kubernetes)
- Modify global settings
- Delete other users' data
- Execute playbooks on any server

**Affected Files:**
- [routes/sessions.js](backend/routes/sessions.js)
- [routes/playbook.js](backend/routes/playbook.js)
- [routes/settings.js](backend/routes/settings.js)

### 2. Command Injection in Inventory Generation (CRITICAL)
**User-supplied passwords, hostnames, and SSH keys are written unquoted to Ansible inventory files.**

```javascript
// backend/services/inventoryService.js:50
line += ` ansible_ssh_pass=${server.password}`;  // UNQUOTED!
```

**Attack Example:**
```
Password: "pass' ansible_become=yes ansible_become_pass='hacked #"
```

**Affected Files:**
- [backend/services/inventoryService.js:50,59](backend/services/inventoryService.js#L50)

### 3. Shell Command Injection in Ansible Playbooks (CRITICAL)
**Variables used unquoted in shell commands:**

```yaml
# ansible/loadbalancer/playbook.yml:112
shell: cat {{ ssl_cert_path }} {{ ssl_key_path }} > {{ ssl_combined_path }}
```

**Attack Example:**
```
ssl_combined_path: "/etc/ssl/haproxy.pem; rm -rf / #"
```

**Affected Files:**
- [ansible/loadbalancer/playbook.yml:112,150,196](ansible/loadbalancer/playbook.yml#L112)
- [ansible/kubectl-istio/playbook.yml:145](ansible/kubectl-istio/playbook.yml#L145)
- [ansible/mongodb/role/tasks/configure.yml:36](ansible/mongodb/role/tasks/configure.yml#L36)

### 4. SSH Keys Stored in /tmp with Predictable Names (CRITICAL)
**SSH private keys written to world-readable /tmp directory:**

```javascript
// backend/services/inventoryService.js:45
const keyPath = `/tmp/ansible_key_${server.hostname.replace(/\./g, '_')}.pem`;
```

**Issues:**
- Predictable filename pattern
- `/tmp` may be world-readable
- No guaranteed cleanup on crash

### 5. Plaintext Credentials in Temporary Files (CRITICAL)
**MySQL and MongoDB credentials stored in /tmp on target servers:**

```javascript
// backend/config/index.js:62-63
credentialDefaults: {
  mysql: { path: '/tmp/mysql_credentials.txt' },
  mongodb: { path: '/tmp/mongodb_credentials.txt' }
}
```

### 6. Encryption Keys Stored on Disk (HIGH)
**AES-256 encryption key stored in plaintext file:**

```javascript
// backend/database.js:22
const KEY_FILE = path.join(dataDir, '.encryption_key');
```

**Better Approach:** Use environment variable `STACKBILL_ENCRYPTION_KEY`

---

## Detailed Findings by Category

### A. Authentication & Authorization

| # | Issue | Risk | Location |
|---|-------|------|----------|
| A1 | No authentication on any endpoint | CRITICAL | All routes |
| A2 | No session ownership verification | CRITICAL | sessionController.js |
| A3 | Cross-session data access | CRITICAL | All controllers |
| A4 | Settings modification without auth | MEDIUM | settingsController.js |
| A5 | No rate limiting | LOW | app.js |

### B. Command/Code Injection

| # | Issue | Risk | Location |
|---|-------|------|----------|
| B1 | Unquoted passwords in inventory | CRITICAL | inventoryService.js:50,59 |
| B2 | Unquoted variables in shell commands | CRITICAL | loadbalancer/playbook.yml |
| B3 | Istio version injection | CRITICAL | kubectl-istio/playbook.yml:145 |
| B4 | Kubeadm command injection | HIGH | kubernetes/playbook.yml:290 |
| B5 | MongoDB keyfile path injection | HIGH | mongodb/configure.yml:36 |
| B6 | Helm repo URL injection | HIGH | helm/playbook.yml:70 |

### C. Input Validation

| # | Issue | Risk | Location |
|---|-------|------|----------|
| C1 | No hostname format validation | HIGH | inventoryService.js:27 |
| C2 | No SSH port range validation | MEDIUM | inventoryService.js:27 |
| C3 | No password length/char validation | CRITICAL | inventoryService.js:50 |
| C4 | No SSH username validation | HIGH | inventoryService.js:29 |
| C5 | No NFS config validation | CRITICAL | validation.js:35 |
| C6 | No SSH key format validation | HIGH | inventoryService.js:44 |
| C7 | No filename path traversal check | HIGH | fileController.js:16 |

### D. Sensitive Data Exposure

| # | Issue | Risk | Location |
|---|-------|------|----------|
| D1 | Passwords in Ansible inventory | CRITICAL | inventoryService.js |
| D2 | SSH keys in /tmp | CRITICAL | inventoryService.js:45 |
| D3 | Encryption key on disk | HIGH | database.js:22 |
| D4 | Credentials in API responses | HIGH | playbookController.js:63 |
| D5 | Plaintext credential export | CRITICAL | sessionController.js:101 |
| D6 | Unmasked playbook output | MEDIUM | playbookController.js |
| D7 | Error details exposed | MEDIUM | errorHandler.js:61 |

### E. SQL Injection

| # | Issue | Risk | Location |
|---|-------|------|----------|
| E1 | Dynamic SQL in updateSession | MEDIUM | database.js:585 |

**Note:** Most SQL queries use proper parameterization. The updateSession() function has a design flaw but is mitigated by a hardcoded allowlist.

---

## Remediation Priority

### Immediate (Before Production)

1. **Add Authentication**
   ```javascript
   // Example: JWT middleware
   const jwt = require('jsonwebtoken');

   function authMiddleware(req, res, next) {
     const token = req.headers.authorization?.split(' ')[1];
     if (!token) return res.status(401).json({ error: 'Unauthorized' });

     try {
       req.user = jwt.verify(token, process.env.JWT_SECRET);
       next();
     } catch {
       res.status(401).json({ error: 'Invalid token' });
     }
   }

   app.use('/api', authMiddleware);
   ```

2. **Quote All Inventory Variables**
   ```javascript
   // backend/services/inventoryService.js
   function escapeForAnsible(value) {
     return "'" + value.replace(/'/g, "'\\''") + "'";
   }

   line += ` ansible_ssh_pass=${escapeForAnsible(server.password)}`;
   ```

3. **Use Ansible quote Filter**
   ```yaml
   # In all playbooks
   shell: cat {{ ssl_cert_path | quote }} {{ ssl_key_path | quote }} > {{ ssl_combined_path | quote }}
   ```

4. **Validate All User Input**
   ```javascript
   // backend/middleware/inputValidation.js
   function validateHostname(hostname) {
     const pattern = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
     return pattern.test(hostname) && hostname.length <= 255;
   }

   function validateIP(ip) {
     const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
     return pattern.test(ip) && ip.split('.').every(n => parseInt(n) <= 255);
   }
   ```

5. **Use Environment Variable for Encryption Key**
   ```javascript
   // backend/database.js
   const ENCRYPTION_KEY = process.env.STACKBILL_ENCRYPTION_KEY;
   if (!ENCRYPTION_KEY) {
     throw new Error('STACKBILL_ENCRYPTION_KEY environment variable required');
   }
   ```

### Short-Term (1-2 Weeks)

6. **Secure SSH Key Storage**
   ```javascript
   const os = require('os');
   const crypto = require('crypto');

   function getSecureKeyPath(hostname) {
     const hash = crypto.createHash('sha256').update(hostname).digest('hex').slice(0, 16);
     const tmpDir = os.tmpdir();
     return path.join(tmpDir, `ansible_key_${hash}_${process.pid}.pem`);
   }
   ```

7. **Add Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');

   app.use('/api', rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100
   }));
   ```

8. **Session Ownership Verification**
   ```javascript
   function verifySessionOwnership(sessionId, userId) {
     const session = db.prepare(
       'SELECT * FROM sessions WHERE id = ? AND user_id = ?'
     ).get(sessionId, userId);
     return !!session;
   }
   ```

### Medium-Term (1 Month)

9. Implement RBAC (Role-Based Access Control)
10. Add audit logging for all sensitive operations
11. Implement credential masking in logs
12. Set up HTTPS enforcement
13. Add security headers (HSTS, CSP, etc.)

---

## Testing Recommendations

After implementing fixes, verify with these tests:

```bash
# Test 1: Command injection in password
curl -X POST http://localhost:3000/api/playbook/mysql \
  -H "Content-Type: application/json" \
  -d '{"servers":[{"hostname":"test","password":"test'\'' whoami '\''"}]}'

# Test 2: Path traversal in hostname
curl -X POST http://localhost:3000/api/playbook/mysql \
  -H "Content-Type: application/json" \
  -d '{"servers":[{"hostname":"../../etc/passwd"}]}'

# Test 3: Cross-session access (should fail with auth)
curl http://localhost:3000/api/sessions/other-user-session-id/export
```

---

## Conclusion

The application has significant security gaps that **must be addressed before production deployment**. The most critical issues are:

1. **Complete lack of authentication** - Anyone can access everything
2. **Command injection vectors** - Attackers can execute arbitrary commands on target servers
3. **Sensitive data exposure** - Passwords and keys stored/transmitted insecurely

**Recommendation:** Do NOT deploy to production until at minimum:
- Authentication is implemented
- All inventory values are properly quoted/escaped
- Input validation is added for all user-supplied data

---

*Report generated by Claude Code security audit*
