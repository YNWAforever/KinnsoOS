# Additive legacy change: fire a sync webhook on publish-state transitions

The legacy app already dispatches `App\Events\PostPublished`, `PostUnpublished`,
`PostDeleted` from `App\Services\PostPublisher` (wired in `EventServiceProvider`).
Add ONE listener that POSTs an HMAC-signed webhook to n8n. No live-site change.

## `app/Listeners/SyncToSupabase.php`
```php
<?php
namespace App\Listeners;

use App\Events\{PostPublished, PostUnpublished, PostDeleted};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Http;

class SyncToSupabase implements ShouldQueue
{
    public function handle(PostPublished|PostUnpublished|PostDeleted $event): void
    {
        $url = config('services.sync.webhook_url');
        $secret = config('services.sync.webhook_secret');
        if (! $url || ! $secret) return;

        $eventName = match (true) {
            $event instanceof PostDeleted => 'deleted',
            $event instanceof PostUnpublished => 'unpublished',
            default => 'published',
        };
        $body = json_encode(['legacy_post_id' => $event->post->id, 'event' => $eventName]);
        $sig = hash_hmac('sha256', $body, $secret);

        Http::withHeaders(['X-Foso-Signature' => $sig, 'Content-Type' => 'application/json'])
            ->withBody($body, 'application/json')
            ->post($url); // queued + Laravel HTTP retries; n8n drift-sweep is the durable backstop
    }
}
```

## `app/Providers/EventServiceProvider.php` (add to `$listen`)
```php
\App\Events\PostPublished::class   => [\App\Listeners\SyncToSupabase::class],
\App\Events\PostUnpublished::class => [\App\Listeners\SyncToSupabase::class],
\App\Events\PostDeleted::class     => [\App\Listeners\SyncToSupabase::class],
```

## `config/services.php`
```php
'sync' => [
    'webhook_url' => env('SYNC_WEBHOOK_URL'),     // n8n incremental webhook
    'webhook_secret' => env('SYNC_WEBHOOK_SECRET'),
],
```

Verify (legacy tinker): `event(new App\Events\PostPublished(Post::first()));` → an n8n execution appears.
