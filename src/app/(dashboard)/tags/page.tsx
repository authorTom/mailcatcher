import { Tags as TagsIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { listAllTags } from '@/lib/queries/contacts';
import { TagsManager } from './tags-manager';

export const metadata: Metadata = { title: 'Tags' };
export const dynamic = 'force-dynamic';

export default async function TagsPage() {
  const tags = listAllTags();

  return (
    <>
      <PageHeader
        title="Tags"
        description="Group contacts however makes sense to you — tags are also filters and segments."
      />

      {tags.length === 0 ? (
        <Card>
          <EmptyState
            icon={TagsIcon}
            title="No tags yet"
            description="Create a tag to start grouping contacts. You can apply tags in bulk from the contacts table."
            action={<TagsManager tags={[]} createOnly />}
          />
        </Card>
      ) : (
        <TagsManager tags={tags} />
      )}
    </>
  );
}
