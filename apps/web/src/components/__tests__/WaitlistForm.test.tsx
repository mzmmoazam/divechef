import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WaitlistForm } from '../WaitlistForm';

describe('WaitlistForm', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  it('submits email + note to /api/waitlist', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, email: 'a@b.com' }),
    });

    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/dive computer/i), {
      target: { value: 'Peregrine' },
    });
    fireEvent.click(screen.getByRole('button', { name: /request invite/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/waitlist', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', note: 'Peregrine' }),
      }));
    });
  });

  it('shows the success message after a successful submit', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, email: 'a@b.com' }),
    });

    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /request invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/thanks/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('shows the error message on a 400', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_email' }),
    });

    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /request invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });
  });

  it('shows the error message on network failure', async () => {
    (global.fetch as any).mockRejectedValue(new Error('offline'));

    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /request invite/i }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
  });

  it('disables the submit button while in flight', async () => {
    let resolve!: (v: unknown) => void;
    (global.fetch as any).mockReturnValue(new Promise((r) => { resolve = r; }));

    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    const button = screen.getByRole('button', { name: /request invite/i });
    fireEvent.click(button);

    expect(button).toBeDisabled();

    await act(async () => {
      resolve({ ok: true, json: async () => ({ ok: true, email: 'a@b.com' }) });
    });

    await waitFor(() => {
      expect(screen.getByText(/thanks/i)).toBeInTheDocument();
    });
  });
});
