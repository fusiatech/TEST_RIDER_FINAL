import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ROLE_PERMISSIONS, type UserRole, type Permission } from '@/lib/types'

export type PermissionKey = keyof Permission

export function checkPermission(role: UserRole, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role][permission]
}

export function hasAllPermissions(role: UserRole, permissions: PermissionKey[]): boolean {
  return permissions.every((p) => checkPermission(role, p))
}

export function hasAnyPermission(role: UserRole, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => checkPermission(role, p))
}

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const session = await auth()
  if (!session?.user?.role) return null
  return session.user.role as UserRole
}

export async function requirePermission(
  permission: PermissionKey
): Promise<NextResponse | null> {
  const session = await auth()
  
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    )
  }
  
  const role = session.user.role as UserRole
  if (!role) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'User role not found' },
      { status: 401 }
    )
  }
  
  if (!checkPermission(role, permission)) {
    return NextResponse.json(
      { 
        error: 'Forbidden', 
        message: `Permission denied: ${permission} requires ${getRequiredRoles(permission).join(' or ')} role` 
      },
      { status: 403 }
    )
  }
  
  return null
}

export async function requireAnyPermission(
  permissions: PermissionKey[]
): Promise<NextResponse | null> {
  const session = await auth()
  
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    )
  }
  
  const role = session.user.role as UserRole
  if (!role) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'User role not found' },
      { status: 401 }
    )
  }
  
  if (!hasAnyPermission(role, permissions)) {
    return NextResponse.json(
      { 
        error: 'Forbidden', 
        message: `Permission denied: requires one of ${permissions.join(', ')}` 
      },
      { status: 403 }
    )
  }
  
  return null
}

export async function requireAllPermissions(
  permissions: PermissionKey[]
): Promise<NextResponse | null> {
  const session = await auth()
  
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    )
  }
  
  const role = session.user.role as UserRole
  if (!role) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'User role not found' },
      { status: 401 }
    )
  }
  
  if (!hasAllPermissions(role, permissions)) {
    return NextResponse.json(
      { 
        error: 'Forbidden', 
        message: `Permission denied: requires all of ${permissions.join(', ')}` 
      },
      { status: 403 }
    )
  }
  
  return null
}

export function getRequiredRoles(permission: PermissionKey): UserRole[] {
  const roles: UserRole[] = []
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    if (perms[permission]) {
      roles.push(role as UserRole)
    }
  }
  return roles
}

export function getPermissionsForRole(role: UserRole): Permission {
  return ROLE_PERMISSIONS[role]
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export function isEditor(role: UserRole): boolean {
  return role === 'editor' || role === 'admin'
}

export function isViewer(role: UserRole): boolean {
  return true
}

export type PermissionCheckResult = {
  authorized: boolean
  role: UserRole | null
  permissions: Permission | null
  error?: string
}

export async function checkUserPermissions(): Promise<PermissionCheckResult> {
  const session = await auth()
  
  if (!session?.user) {
    return {
      authorized: false,
      role: null,
      permissions: null,
      error: 'Not authenticated',
    }
  }
  
  const role = session.user.role as UserRole
  if (!role) {
    return {
      authorized: false,
      role: null,
      permissions: null,
      error: 'User role not found',
    }
  }
  
  return {
    authorized: true,
    role,
    permissions: ROLE_PERMISSIONS[role],
  }
}
