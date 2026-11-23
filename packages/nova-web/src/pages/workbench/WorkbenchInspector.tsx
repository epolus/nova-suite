/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { cmdb, type ChangeDetail, type Incident } from '@/api/client';
import RelatedRecordsCard from '@/components/RelatedRecordsCard';
import CustomFieldsSection from '@/components/CustomFieldsSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { sectionsForEntity } from '@/components/customFieldSections';
import { queryKeys } from '@/hooks/queries/keys';
import { useIncidentLinkedProblems } from '@/hooks/queries';
import WorkbenchInsights from './WorkbenchInsights';
import type { WorkbenchKind } from './workbenchUrl';

type Props = {
  kind: WorkbenchKind | null;
  incident?: Incident;
  change?: ChangeDetail;
  entityId?: string;
  onOpenNumber: (number: string) => void;
  onOpenMajor: (id: string) => void;
};

export default function WorkbenchInspector({
  kind,
  incident,
  change,
  entityId,
  onOpenNumber,
  onOpenMajor,
}: Props) {
  const t = useTranslations('pages.workbench');
  const callerId = incident?.caller_id ?? undefined;
  const assets = useQuery({
    queryKey: queryKeys.reference.cmdbItems({ assigned_to: callerId ?? '' }, 1, 20),
    queryFn: () => cmdb.items({ assigned_to: callerId ?? '' }, 1, 20),
    enabled: kind === 'incident' && Boolean(callerId),
  });
  const linkedProblems = useIncidentLinkedProblems(incident?.id, kind === 'incident');
  const showRequester = kind === 'incident';
  const [tab, setTab] = useState(showRequester ? 'requester' : 'links');
  const [tabKind, setTabKind] = useState(kind);
  if (kind !== tabKind) {
    setTabKind(kind);
    setTab(showRequester ? 'requester' : 'links');
  }
  const fieldEntity = kind === 'incident' ? 'incident' : kind === 'change' ? 'change' : null;
  const fieldValues = kind === 'incident'
    ? (incident?.custom_fields ?? {})
    : (change?.custom_fields ?? {});

  if (!kind || !entityId) {
    return <p className="p-4 text-sm text-muted-foreground">{t('noActive')}</p>;
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="h-full min-h-0">
      <TabsList className="mx-2 mt-2 grid !h-auto w-[calc(100%-1rem)] grid-cols-2 !items-stretch gap-1">
        {showRequester && <TabsTrigger value="requester" className="!h-auto flex-none whitespace-normal px-2 py-1.5 text-xs">{t('requester')}</TabsTrigger>}
        {showRequester && <TabsTrigger value="insights" className="!h-auto flex-none whitespace-normal px-2 py-1.5 text-xs">{t('insights')}</TabsTrigger>}
        <TabsTrigger value="links" className="!h-auto flex-none whitespace-normal px-2 py-1.5 text-xs">{t('links')}</TabsTrigger>
        <TabsTrigger value="fields" className="!h-auto flex-none whitespace-normal px-2 py-1.5 text-xs">{t('fields')}</TabsTrigger>
      </TabsList>
      {showRequester && incident && (
        <TabsContent value="insights" className="min-h-0">
          <WorkbenchInsights key={incident.id} incidentId={incident.id} active={tab === 'insights'} onOpenNumber={onOpenNumber} />
        </TabsContent>
      )}
      {showRequester && (
        <TabsContent value="requester" className="min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-3 p-3 text-sm">
              {!incident?.caller_id && <p className="text-muted-foreground">{t('noRequester')}</p>}
              {incident?.caller_id && (
                <>
                  <div>
                    <p className="font-medium">{incident.caller_name || t('requester')}</p>
                    <p className="text-muted-foreground">{incident.caller_email}</p>
                    {incident.caller_vip && <Badge className="mt-1">{t('vip')}</Badge>}
                  </div>
                  <p><span className="text-muted-foreground">{t('department')}: </span>{incident.caller_department_name || '—'}</p>
                  <p><span className="text-muted-foreground">{t('manager')}: </span>{incident.caller_manager_name || '—'}</p>
                  <div>
                    <p className="mb-1 text-muted-foreground">{t('assets')}</p>
                    {(assets.data?.items ?? []).length === 0 && (
                      <p className="text-muted-foreground">{t('noAssets')}</p>
                    )}
                    <ul className="space-y-1">
                      {(assets.data?.items ?? []).map((item) => (
                        <li key={item.id}>{item.display_name || item.name}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      )}
      <TabsContent value="links" className="min-h-0">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-3">
            {kind === 'incident' && (incident?.linked_major_incidents ?? []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('linkedMajor')}</p>
                {(incident?.linked_major_incidents ?? []).map((link) => (
                  <Button key={link.id} type="button" variant="ghost" className="h-auto w-full justify-start px-2" onClick={() => onOpenMajor(link.id)}>
                    {link.number || link.title}
                  </Button>
                ))}
              </div>
            )}
            {kind === 'incident' && (linkedProblems.data ?? []).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('linkedProblems')}</p>
                {(linkedProblems.data ?? []).map((link) => (
                  <Button
                    key={link.problem_id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start px-2"
                    onClick={() => link.problem_number && onOpenNumber(link.problem_number)}
                  >
                    {link.problem_number} {link.problem_title}
                  </Button>
                ))}
              </div>
            )}
            {(kind === 'incident' || kind === 'problem' || kind === 'change') && (
              <RelatedRecordsCard
                entityType={kind}
                entityId={entityId}
                onOpenNumber={onOpenNumber}
              />
            )}
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="fields" className="min-h-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-3">
            {!fieldEntity && <p className="text-sm text-muted-foreground">{t('noCustomFields')}</p>}
            {fieldEntity && sectionsForEntity(fieldEntity).map((section) => (
              <CustomFieldsSection
                key={section}
                entityType={fieldEntity}
                section={section}
                values={fieldValues}
                onChange={() => undefined}
                readonly
              />
            ))}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
