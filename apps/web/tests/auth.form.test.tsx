// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AuthForm } from '@/components/auth/AuthForm'

// This repo runs vitest with `globals: false`, so Testing Library's automatic
// afterEach cleanup is not auto-registered. Register it explicitly here so each
// render starts from a clean DOM (otherwise global `screen` queries see leaked
// forms/alerts from prior tests).
afterEach(cleanup)

describe('AuthForm — sign-in mode', () => {
  it('renders email and password inputs', () => {
    render(
      <AuthForm
        mode="sign-in"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign in' }}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Email address')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('shows a server error when errorMessage prop is set', () => {
    render(
      <AuthForm
        mode="sign-in"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign in' }}
        onSubmit={vi.fn()}
        errorMessage="Invalid email or password."
      />
    )
    expect(screen.getByRole('alert').textContent).toBe('Invalid email or password.')
  })

  it('does not show an alert when errorMessage is absent', () => {
    render(
      <AuthForm
        mode="sign-in"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign in' }}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('calls onSubmit with email and password when form is submitted', () => {
    const onSubmit = vi.fn()
    render(
      <AuthForm
        mode="sign-in"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign in' }}
        onSubmit={onSubmit}
      />
    )
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.submit(screen.getByRole('form'))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com', password: 'hunter2' })
  })

  it('does not call onSubmit when email is empty', () => {
    const onSubmit = vi.fn()
    render(
      <AuthForm
        mode="sign-in"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign in' }}
        onSubmit={onSubmit}
      />
    )
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.submit(screen.getByRole('form'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not call onSubmit when password is empty', () => {
    const onSubmit = vi.fn()
    render(
      <AuthForm
        mode="sign-in"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign in' }}
        onSubmit={onSubmit}
      />
    )
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
    fireEvent.submit(screen.getByRole('form'))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('AuthForm — sign-up mode', () => {
  it('renders with sign-up submit label', () => {
    render(
      <AuthForm
        mode="sign-up"
        labels={{ email: 'Email address', password: 'Password', submit: 'Sign up' }}
        onSubmit={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy()
  })
})
