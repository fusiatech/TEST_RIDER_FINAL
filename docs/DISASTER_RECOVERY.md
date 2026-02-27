# SwarmUI Disaster Recovery Plan

## Overview

This document outlines the backup and disaster recovery procedures for SwarmUI. It covers backup strategies, recovery procedures, and best practices for maintaining data integrity.

## Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RPO** (Recovery Point Objective) | 24 hours | Maximum acceptable data loss |
| **RTO** (Recovery Time Objective) | 1 hour | Maximum acceptable downtime |
| **MTTR** (Mean Time To Recovery) | 30 minutes | Average recovery time |

## Data Architecture

SwarmUI stores all persistent data in a single JSON file (`db.json`) which contains:

- **Sessions**: Chat sessions and message history
- **Projects**: Project definitions and configurations
- **Jobs**: Swarm job queue and history
- **Scheduled Tasks**: Automated task schedules
- **Evidence**: Evidence ledger entries
- **Test Runs**: Test execution history
- **Extensions**: Installed extensions
- **Users**: User accounts and roles (RBAC)
- **Settings**: Application configuration

## Backup Procedures

### Automated Backups

#### Using the Backup Script

```bash
# Create a backup with default settings
npx tsx scripts/backup.ts

# Specify custom backup directory
npx tsx scripts/backup.ts --backup-dir /path/to/backups

# Keep more backup versions
npx tsx scripts/backup.ts --keep 14
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | `./backups` | Directory for backup files |
| `DATA_FILE` | `./db.json` | Path to database file |
| `BACKUP_KEEP_COUNT` | `7` | Number of backups to retain |

### Docker-based Automated Backups

Start the backup service:

```bash
docker-compose --profile backup up -d
```

This runs daily backups automatically.

### Manual Backups via API

Administrators can create backups through the API:

```bash
# List existing backups
curl -X GET http://localhost:3000/api/admin/backup \
  -H "Authorization: Bearer <token>"

# Create a new backup
curl -X POST http://localhost:3000/api/admin/backup \
  -H "Authorization: Bearer <token>"
```

### Backup File Format

Backup files are JSON with the following structure:

```json
{
  "version": "1.0",
  "metadata": {
    "version": "1.0",
    "timestamp": "2026-02-27T10:30:00.000Z",
    "createdAt": 1740652200000,
    "sourceFile": "./db.json",
    "checksum": "sha256-hash...",
    "recordCounts": {
      "sessions": 10,
      "projects": 5,
      "jobs": 100,
      "scheduledTasks": 3,
      "evidence": 50,
      "testRuns": 25,
      "extensions": 2,
      "users": 8
    }
  },
  "data": { ... }
}
```

## Recovery Procedures

### Standard Recovery

1. **Stop the application**
   ```bash
   docker-compose down
   # or
   pkill -f "node.*server.ts"
   ```

2. **List available backups**
   ```bash
   npx tsx scripts/restore.ts --list
   ```

3. **Restore from backup**
   ```bash
   npx tsx scripts/restore.ts backups/backup-2026-02-27T10-30-00-000Z.json
   ```

4. **Verify the restore**
   ```bash
   # Check file integrity
   cat db.json | jq '.sessions | length'
   cat db.json | jq '.projects | length'
   ```

5. **Restart the application**
   ```bash
   npm run dev
   # or
   docker-compose up -d
   ```

### Emergency Recovery (No Backup Available)

If no backup is available, check for:

1. **Pre-restore backups**: `db.json.pre-restore.*.bak`
2. **Docker volumes**: `docker volume ls | grep swarm`
3. **Cloud storage**: Check configured cloud backup destinations

### Recovery from Corrupted Database

1. **Identify corruption**
   ```bash
   # Try to parse the database
   cat db.json | jq . > /dev/null
   ```

2. **Attempt repair**
   ```bash
   # If JSON is partially valid, extract what you can
   cat db.json | jq '.sessions' > sessions-backup.json
   ```

3. **Restore from last known good backup**
   ```bash
   npx tsx scripts/restore.ts backups/backup-latest.json --force
   ```

## Backup Verification

### Automated Verification

The backup script automatically verifies:
- JSON validity
- Checksum integrity
- Record counts

### Manual Verification

```bash
# Verify backup integrity
cat backups/backup-*.json | jq '.metadata.checksum'

# Compare record counts
cat backups/backup-*.json | jq '.metadata.recordCounts'

# Test restore to temporary location
DATA_FILE=/tmp/test-db.json npx tsx scripts/restore.ts backups/backup-latest.json
```

## Backup Storage Recommendations

### Local Storage

- Store backups on a separate disk/partition
- Use RAID for redundancy
- Implement file system snapshots (ZFS, Btrfs)

### Cloud Storage

Recommended cloud backup destinations:

1. **AWS S3**
   ```bash
   aws s3 sync ./backups s3://your-bucket/swarm-ui-backups/
   ```

2. **Google Cloud Storage**
   ```bash
   gsutil rsync -r ./backups gs://your-bucket/swarm-ui-backups/
   ```

3. **Azure Blob Storage**
   ```bash
   az storage blob upload-batch -d backups -s ./backups
   ```

### Backup Rotation Policy

| Retention Period | Frequency | Count |
|-----------------|-----------|-------|
| Daily | Every day | 7 |
| Weekly | Every Sunday | 4 |
| Monthly | 1st of month | 12 |

## Monitoring and Alerts

### Health Checks

Monitor backup health via:

```bash
# Check last backup age
ls -la backups/ | tail -1

# Via API
curl http://localhost:3000/api/health | jq '.lastBackup'
```

### Alerting Thresholds

| Condition | Severity | Action |
|-----------|----------|--------|
| No backup in 24h | Warning | Check backup job |
| No backup in 48h | Critical | Manual intervention |
| Backup size anomaly (>50% change) | Warning | Investigate |
| Restore test failure | Critical | Fix immediately |

## Disaster Scenarios

### Scenario 1: Database Corruption

**Symptoms**: Application errors, JSON parse failures
**Recovery Time**: 15-30 minutes
**Steps**:
1. Stop application
2. Restore from latest backup
3. Restart application
4. Verify data integrity

### Scenario 2: Server Failure

**Symptoms**: Complete service unavailability
**Recovery Time**: 30-60 minutes
**Steps**:
1. Provision new server
2. Deploy application
3. Restore from cloud backup
4. Update DNS/load balancer
5. Verify service

### Scenario 3: Ransomware/Security Breach

**Symptoms**: Encrypted files, unauthorized access
**Recovery Time**: 1-4 hours
**Steps**:
1. Isolate affected systems
2. Assess damage scope
3. Restore from offline/immutable backup
4. Reset all credentials
5. Audit access logs
6. Implement additional security measures

## Contact Information

### Primary Contacts

| Role | Name | Contact |
|------|------|---------|
| System Administrator | TBD | admin@example.com |
| DevOps Lead | TBD | devops@example.com |
| Security Team | TBD | security@example.com |

### Escalation Path

1. **Level 1**: On-call engineer (15 min response)
2. **Level 2**: Team lead (30 min response)
3. **Level 3**: Management (1 hour response)

## Testing Schedule

| Test Type | Frequency | Last Tested | Next Test |
|-----------|-----------|-------------|-----------|
| Backup Creation | Weekly | - | - |
| Restore Test | Monthly | - | - |
| Full DR Drill | Quarterly | - | - |

## Appendix

### Backup Script Options

```
Usage:
  npx tsx scripts/backup.ts [options]

Options:
  --backup-dir <path>  Directory to store backups (default: ./backups)
  --data-file <path>   Path to database file (default: ./db.json)
  --keep <count>       Number of backups to keep (default: 7)
  --help, -h           Show help message
```

### Restore Script Options

```
Usage:
  npx tsx scripts/restore.ts <backup-file> [options]
  npx tsx scripts/restore.ts --list

Options:
  --list, -l           List available backups
  --data-file <path>   Path to database file (default: ./db.json)
  --force, -f          Skip confirmation prompt
  --help, -h           Show help message
```

### Useful Commands

```bash
# Quick backup
npx tsx scripts/backup.ts

# List backups
npx tsx scripts/restore.ts --list

# Restore latest
npx tsx scripts/restore.ts backups/$(ls -t backups | head -1)

# Verify database
cat db.json | jq 'keys'

# Check backup integrity
cat backups/backup-*.json | jq '.metadata'
```
