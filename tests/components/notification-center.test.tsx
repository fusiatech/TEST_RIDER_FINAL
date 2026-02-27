import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockToggleNotificationCenter = vi.fn()
const mockMarkNotificationRead = vi.fn()
const mockMarkAllNotificationsRead = vi.fn()
const mockClearNotifications = vi.fn()

const mockNotifications = [
  {
    id: '1',
    type: 'info' as const,
    title: 'Test Notification',
    message: 'This is a test message',
    timestamp: Date.now(),
    read: false,
  },
  {
    id: '2',
    type: 'success' as const,
    title: 'Success Notification',
    message: 'Operation completed successfully',
    timestamp: Date.now() - 60000,
    read: true,
  },
]

vi.mock('@/lib/store', () => ({
  useSwarmStore: (selector: (state: unknown) => unknown) => {
    const state = {
      notifications: mockNotifications,
      notificationCenterOpen: true,
      toggleNotificationCenter: mockToggleNotificationCenter,
      markNotificationRead: mockMarkNotificationRead,
      markAllNotificationsRead: mockMarkAllNotificationsRead,
      clearNotifications: mockClearNotifications,
      getUnreadCount: () => mockNotifications.filter((n) => !n.read).length,
    }
    return selector(state)
  },
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}))

import { NotificationCenter } from '@/components/notification-center'

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders notification bell button', () => {
    render(<NotificationCenter />)
    const bellButton = screen.getByRole('button', { name: /notifications/i })
    expect(bellButton).toBeInTheDocument()
  })

  it('shows unread count badge', () => {
    render(<NotificationCenter />)
    const badge = screen.getByText('1')
    expect(badge).toBeInTheDocument()
  })

  it('renders notifications list when open', () => {
    render(<NotificationCenter />)
    expect(screen.getByText('Test Notification')).toBeInTheDocument()
    expect(screen.getByText('This is a test message')).toBeInTheDocument()
  })

  it('renders success notification', () => {
    render(<NotificationCenter />)
    expect(screen.getByText('Success Notification')).toBeInTheDocument()
    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument()
  })

  it('shows notification count in footer', () => {
    render(<NotificationCenter />)
    expect(screen.getByText(/2 notifications/)).toBeInTheDocument()
  })

  it('shows unread count in footer', () => {
    render(<NotificationCenter />)
    expect(screen.getByText(/1 unread/)).toBeInTheDocument()
  })

  it('calls toggleNotificationCenter when bell is clicked', () => {
    render(<NotificationCenter />)
    const bellButton = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(bellButton)
    expect(mockToggleNotificationCenter).toHaveBeenCalled()
  })

  it('calls markAllNotificationsRead when mark all button is clicked', () => {
    render(<NotificationCenter />)
    const markAllButton = screen.getByRole('button', { name: /mark all as read/i })
    fireEvent.click(markAllButton)
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled()
  })

  it('calls clearNotifications when clear button is clicked', () => {
    render(<NotificationCenter />)
    const clearButton = screen.getByRole('button', { name: /clear all/i })
    fireEvent.click(clearButton)
    expect(mockClearNotifications).toHaveBeenCalled()
  })

  it('calls toggleNotificationCenter when close button is clicked', () => {
    render(<NotificationCenter />)
    const closeButton = screen.getByRole('button', { name: /close notifications/i })
    fireEvent.click(closeButton)
    expect(mockToggleNotificationCenter).toHaveBeenCalled()
  })

  it('renders header with title', () => {
    render(<NotificationCenter />)
    expect(screen.getByText('Notifications')).toBeInTheDocument()
  })

  it('displays relative timestamp', () => {
    render(<NotificationCenter />)
    expect(screen.getByText('Just now')).toBeInTheDocument()
  })
})

describe('NotificationCenter - Empty State', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.doMock('@/lib/store', () => ({
      useSwarmStore: (selector: (state: unknown) => unknown) => {
        const state = {
          notifications: [],
          notificationCenterOpen: true,
          toggleNotificationCenter: mockToggleNotificationCenter,
          markNotificationRead: mockMarkNotificationRead,
          markAllNotificationsRead: mockMarkAllNotificationsRead,
          clearNotifications: mockClearNotifications,
          getUnreadCount: () => 0,
        }
        return selector(state)
      },
    }))
  })

  it('renders bell button without badge when no unread', async () => {
    const { useSwarmStore } = await import('@/lib/store')
    vi.mocked(useSwarmStore).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        notifications: [],
        notificationCenterOpen: true,
        toggleNotificationCenter: mockToggleNotificationCenter,
        markNotificationRead: mockMarkNotificationRead,
        markAllNotificationsRead: mockMarkAllNotificationsRead,
        clearNotifications: mockClearNotifications,
        getUnreadCount: () => 0,
      }
      return selector(state)
    })

    render(<NotificationCenter />)
    const bellButton = screen.getByRole('button', { name: /notifications/i })
    expect(bellButton).toBeInTheDocument()
  })
})
