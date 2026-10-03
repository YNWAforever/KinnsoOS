'use client'

import { useId, useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { submitEnquiryAction } from '@/lib/enquiries/actions'
import type { EnquiryType } from '@/lib/enquiries/types'
import type { Messages } from '@/lib/i18n/messages/en'

type EnquiryMessages = Messages['enquiry']
type SubmissionState = 'form' | 'success'
type Feedback = 'invalid' | 'rate_limited' | 'failed' | null

export function EnquiryDialog({ type, targetId, targetName, triggerLabel, t }: {
  type: EnquiryType
  targetId: string
  targetName: string
  triggerLabel: string
  t: EnquiryMessages
}): React.ReactNode {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [submissionState, setSubmissionState] = useState<SubmissionState>('form')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()
  const fieldId = useId()
  const nameId = `${fieldId}-name`
  const emailId = `${fieldId}-email`
  const messageId = `${fieldId}-message`
  const websiteId = `${fieldId}-website`

  const blocksDismissal = isPending && submissionState === 'form'
  const purpose = type === 'creator_collab' ? t.creatorPurpose : t.merchantPurpose
  const feedbackMessage = feedback === 'rate_limited' ? t.rateLimited : feedback ? t[feedback] : null

  function resetCompletedForm() {
    setName('')
    setEmail('')
    setMessage('')
    setWebsite('')
    setFeedback(null)
    setSubmissionState('form')
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && blocksDismissal) return
    setOpen(nextOpen)
    if (!nextOpen && submissionState === 'success') resetCompletedForm()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return

    setFeedback(null)
    startTransition(async () => {
      const result = await submitEnquiryAction({
        type,
        targetId,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        website,
      })

      if (result.ok) {
        setSubmissionState('success')
        return
      }

      setFeedback(result.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (blocksDismissal) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (blocksDismissal) event.preventDefault()
        }}
      >
        <DialogHeader aria-live={submissionState === 'success' ? 'polite' : undefined}>
          <DialogTitle>{submissionState === 'success' ? t.successTitle : t.dialogTitle}</DialogTitle>
          <DialogDescription>{submissionState === 'success' ? t.successBody : t.dialogDescription}</DialogDescription>
        </DialogHeader>

        {submissionState === 'success' ? (
          <div>
            <DialogClose asChild>
              <Button type="button">{t.close}</Button>
            </DialogClose>
          </div>
        ) : (
          <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
            <div className="rounded-md bg-kinnso-cream2 p-3 text-sm">
              <p className="font-medium">{targetName}</p>
              <p className="text-muted-foreground">{purpose}</p>
            </div>

            <div className="grid gap-2">
              <label htmlFor={nameId}>{t.nameLabel}</label>
              <input
                id={nameId}
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-md border bg-background px-3 py-2"
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor={emailId}>{t.emailLabel}</label>
              <input
                id={emailId}
                name="email"
                type="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-md border bg-background px-3 py-2"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor={messageId}>{t.messageLabel}</label>
              <textarea
                id={messageId}
                name="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-28 rounded-md border bg-background px-3 py-2"
              />
            </div>
            <input
              aria-hidden="true"
              id={websiteId}
              autoComplete="off"
              className="absolute -left-[10000px] h-px w-px overflow-hidden"
              name="website"
              tabIndex={-1}
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />

            {feedbackMessage && <p aria-live="polite" className="text-sm text-destructive">{feedbackMessage}</p>}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending}>{t.cancel}</Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>{isPending ? t.submitting : t.submit}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
