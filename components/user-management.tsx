'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  UserPlus,
  Shield,
  Edit2,
  Trash2,
  Mail,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { User, UserRole } from '@/lib/types'
import { USER_ROLE_LABELS, USER_ROLE_DESCRIPTIONS } from '@/lib/types'

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-500/10 text-red-500 border-red-500/20',
  editor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  viewer: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

interface UserManagementProps {
  trigger?: React.ReactNode
}

export function UserManagement({ trigger }: UserManagementProps) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingUser, setAddingUser] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('editor')
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [savingRole, setSavingRole] = useState(false)

  const isAdmin = session?.user?.role === 'admin'

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return
    
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch users')
      }
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (open && isAdmin) {
      fetchUsers()
    }
  }, [open, isAdmin, fetchUsers])

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error('Email is required')
      return
    }

    setAddingUser(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail.trim(),
          name: newUserName.trim() || undefined,
          role: newUserRole,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add user')
      }

      const user = await res.json()
      setUsers((prev) => [...prev, user])
      setNewUserEmail('')
      setNewUserName('')
      setNewUserRole('editor')
      toast.success('User added successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add user'
      toast.error(message)
    } finally {
      setAddingUser(false)
    }
  }

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    setSavingRole(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update role')
      }

      const updated = await res.json()
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? updated : u))
      )
      setEditingUserId(null)
      toast.success('Role updated successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role'
      toast.error(message)
    } finally {
      setSavingRole(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId))
      toast.success('User deleted successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user'
      toast.error(message)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (!isAdmin) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            Manage Users
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            User Management
          </DialogTitle>
          <DialogDescription>
            Manage user roles and permissions. Only administrators can access this panel.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <div className="space-y-6">
            {/* Add User Section */}
            <section className="rounded-lg border border-border p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <UserPlus className="h-4 w-4" />
                Add New User
              </h3>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Email *</label>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Name</label>
                    <Input
                      placeholder="John Doe"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted mb-1 block">Role</label>
                    <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as UserRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['admin', 'editor', 'viewer'] as UserRole[]).map((role) => (
                          <SelectItem key={role} value={role}>
                            <div className="flex items-center gap-2">
                              <span>{USER_ROLE_LABELS[role]}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAddUser}
                    disabled={addingUser || !newUserEmail.trim()}
                    className="gap-2"
                  >
                    {addingUser ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Add User
                  </Button>
                </div>
              </div>
            </section>

            {/* Role Descriptions */}
            <section>
              <h3 className="mb-3 text-sm font-medium">Role Permissions</h3>
              <div className="grid gap-2">
                {(['admin', 'editor', 'viewer'] as UserRole[]).map((role) => (
                  <div
                    key={role}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <Badge variant="outline" className={ROLE_COLORS[role]}>
                      {USER_ROLE_LABELS[role]}
                    </Badge>
                    <span className="text-sm text-muted">
                      {USER_ROLE_DESCRIPTIONS[role]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Users List */}
            <section>
              <h3 className="mb-3 text-sm font-medium">
                Users ({users.length})
              </h3>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchUsers}
                    className="ml-auto"
                  >
                    Retry
                  </Button>
                </div>
              ) : users.length === 0 ? (
                <div className="rounded-lg border border-border px-4 py-8 text-center">
                  <Users className="h-8 w-8 text-muted mx-auto mb-2" />
                  <p className="text-sm text-muted">No users found</p>
                  <p className="text-xs text-muted mt-1">
                    Add users above to manage their roles
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {user.name || 'Unnamed User'}
                          </span>
                          <Badge variant="outline" className={ROLE_COLORS[user.role]}>
                            {USER_ROLE_LABELS[user.role]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(user.createdAt)}
                          </span>
                        </div>
                      </div>

                      {editingUserId === user.id ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={user.role}
                            onValueChange={(v) => handleUpdateRole(user.id, v as UserRole)}
                            disabled={savingRole}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['admin', 'editor', 'viewer'] as UserRole[]).map((role) => (
                                <SelectItem key={role} value={role}>
                                  {USER_ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingUserId(null)}
                            disabled={savingRole}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingUserId(user.id)}
                            title="Edit role"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-500 hover:text-red-400"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export function useUserRole() {
  const { data: session } = useSession()
  return session?.user?.role as UserRole | undefined
}

export function useIsAdmin() {
  const role = useUserRole()
  return role === 'admin'
}

export function useCanPerform(permission: keyof typeof import('@/lib/types').ROLE_PERMISSIONS['admin']) {
  const role = useUserRole()
  if (!role) return false
  
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ROLE_PERMISSIONS } = require('@/lib/types') as typeof import('@/lib/types')
  return ROLE_PERMISSIONS[role]?.[permission] ?? false
}
