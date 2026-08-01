/* SPDX-License-Identifier: AGPL-3.0-only */
import { useNavigate } from 'react-router-dom';
import {
  Background,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  Node,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import type { CI } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { useStatusLabel } from '@/i18n/hooks';
import { RELATIONSHIP_VALUES, type CIData, type RelForm } from './useCIDetail';

export default function CiRelationshipsTab({
  ci,
  canEdit,
  selectedFlowEdgeId,
  setSelectedFlowEdgeId,
  handleDeleteRelationship,
  showRelForm,
  setShowRelForm,
  relError,
  relForm,
  setRelForm,
  ciSearch,
  setCiSearch,
  ciSearchResults,
  ciSearching,
  relSaving,
  handleAddRelationship,
  cancelRelForm,
}: {
  ci: CIData;
  canEdit: boolean;
  selectedFlowEdgeId: string | null;
  setSelectedFlowEdgeId: (v: string | null) => void;
  handleDeleteRelationship: (relId: string) => void;
  showRelForm: boolean;
  setShowRelForm: (v: boolean) => void;
  relError: string;
  relForm: RelForm;
  setRelForm: (v: RelForm) => void;
  ciSearch: string;
  setCiSearch: (v: string) => void;
  ciSearchResults: CI[];
  ciSearching: boolean;
  relSaving: boolean;
  handleAddRelationship: () => void;
  cancelRelForm: () => void;
}) {
  const navigate = useNavigate();
  const tCmdb = useTranslations('pages.cmdb');
  const tActions = useTranslations('common.actions');
  const statusLabel = useStatusLabel();

  const selectedTarget = ciSearchResults.find((c) => c.id === relForm.target);
  const relationshipNodes: Node[] = [
    {
      id: ci.id,
      position: { x: 320, y: 180 },
      data: { label: ci.display_name || ci.name },
      style: {
        border: '2px solid #4f46e5',
        borderRadius: 10,
        background: '#eef2ff',
        fontWeight: 600,
      },
    },
    ...ci.relationships.incoming.map((rel, idx) => ({
      id: rel.source_ci_id,
      position: { x: 60, y: 60 + idx * 90 },
      data: { label: rel.source_display_name || rel.source_name || rel.source_ci_id },
      style: { borderRadius: 10 },
    })),
    ...ci.relationships.outgoing
      .filter((rel) => rel.target_ci_id !== ci.id)
      .map((rel, idx) => ({
        id: rel.target_ci_id,
        position: { x: 580, y: 60 + idx * 90 },
        data: { label: rel.target_display_name || rel.target_name || rel.target_ci_id },
        style: { borderRadius: 10 },
      })),
  ].filter((node, idx, arr) => arr.findIndex((n) => n.id === node.id) === idx);
  const relationshipEdges: Edge[] = [
    ...ci.relationships.incoming.map((rel) => ({
      id: `rel-${rel.id}`,
      source: rel.source_ci_id,
      target: ci.id,
      label: rel.relationship_type,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { relationshipId: rel.id },
      animated: rel.relationship_type === 'depends_on',
    })),
    ...ci.relationships.outgoing.map((rel) => ({
      id: `rel-${rel.id}`,
      source: ci.id,
      target: rel.target_ci_id,
      label: rel.relationship_type,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { relationshipId: rel.id },
      animated: rel.relationship_type === 'depends_on',
    })),
  ];
  const selectedFlowRelationshipId = relationshipEdges.find((e) => e.id === selectedFlowEdgeId)?.data?.relationshipId as string | undefined;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{tCmdb('relationshipFlow')}</h3>
          {canEdit && selectedFlowRelationshipId && (
            <button
              onClick={() => {
                void handleDeleteRelationship(selectedFlowRelationshipId);
                setSelectedFlowEdgeId(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
            >
              {tCmdb('removeSelectedEdge')}
            </button>
          )}
        </div>
        <div className="cmdb-relationship-flow h-[380px] border border-gray-200 rounded-lg overflow-hidden bg-white">
          <ReactFlow
            nodes={relationshipNodes}
            edges={relationshipEdges}
            fitView
            onEdgeClick={(_, edge) => setSelectedFlowEdgeId(edge.id)}
            onPaneClick={() => setSelectedFlowEdgeId(null)}
            onNodeClick={(_, node) => {
              if (node.id !== ci.id) {
                navigate(`/cmdb/${node.id}`);
              }
            }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {tCmdb('flowHint')}
        </p>
      </Card>

      {/* Add Relationship Button */}
      {canEdit && !showRelForm && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowRelForm(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {tCmdb('addRelationship')}
          </button>
        </div>
      )}

      {/* Add Relationship Form */}
      {showRelForm && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tCmdb('addRelationshipTitle')}</h3>
          {relError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{relError}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('direction')}</label>
              <select
                value={relForm.direction}
                onChange={(e) => setRelForm({ ...relForm, direction: e.target.value as 'outgoing' | 'incoming' })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="outgoing">{tCmdb('outgoingDirection', { name: ci.name })}</option>
                <option value="incoming">{tCmdb('incomingDirection', { name: ci.name })}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('relationshipType')}</label>
              <select
                value={relForm.type}
                onChange={(e) => setRelForm({ ...relForm, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {RELATIONSHIP_VALUES.map((value) => (
                  <option key={value} value={value}>{statusLabel(value)}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 relative">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {relForm.direction === 'outgoing' ? tCmdb('targetCi') : tCmdb('sourceCi')}
              </label>
              {selectedTarget ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-indigo-200 bg-indigo-50 rounded-lg">
                  <span className="text-sm font-medium text-indigo-700">{selectedTarget.display_name || selectedTarget.name}</span>
                  <span className="text-xs text-indigo-400">{selectedTarget.class_display_name}</span>
                  <button
                    onClick={() => { setRelForm({ ...relForm, target: '' }); setCiSearch(''); }}
                    className="ml-auto text-indigo-400 hover:text-indigo-600"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={ciSearch}
                    onChange={(e) => setCiSearch(e.target.value)}
                    placeholder={tCmdb('searchCiPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {ciSearch.length >= 2 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {ciSearching ? (
                        <p className="p-3 text-sm text-gray-400">{tCmdb('searching')}</p>
                      ) : ciSearchResults.length === 0 ? (
                        <p className="p-3 text-sm text-gray-400">{tCmdb('noCisFound')}</p>
                      ) : (
                        ciSearchResults.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => { setRelForm({ ...relForm, target: r.id }); setCiSearch(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                          >
                            <span className="text-sm font-medium text-gray-900">{r.display_name || r.name}</span>
                            <span className="text-xs text-gray-400">{r.class_display_name}</span>
                            <Badge value={r.status} />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('notesOptional')}</label>
              <input
                type="text"
                value={relForm.notes}
                onChange={(e) => setRelForm({ ...relForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={tCmdb('relationshipNotesPlaceholder')}
              />
            </div>
          </div>

          {/* Preview */}
          {relForm.target && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-900">
                {relForm.direction === 'outgoing' ? ci.name : (selectedTarget?.display_name || selectedTarget?.name || '?')}
              </span>
              <span className="text-gray-400">&rarr;</span>
              <Badge value={relForm.type} />
              <span className="text-gray-400">&rarr;</span>
              <span className="font-medium text-gray-900">
                {relForm.direction === 'outgoing' ? (selectedTarget?.display_name || selectedTarget?.name || '?') : ci.name}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={cancelRelForm}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              {tActions('cancel')}
            </button>
            <button
              onClick={handleAddRelationship}
              disabled={!relForm.target || relSaving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {relSaving ? tActions('saving') : tCmdb('addRelationshipTitle')}
            </button>
          </div>
        </Card>
      )}

      {/* Outgoing */}
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">
          {tCmdb('outgoingRelationships')}
          <span className="ml-2 text-xs font-normal text-gray-400">({ci.relationships.outgoing.length})</span>
        </h3>
        {ci.relationships.outgoing.length === 0 ? (
          <p className="text-sm text-gray-400">{tCmdb('noOutgoingRelationships')}</p>
        ) : (
          <div className="space-y-2">
            {ci.relationships.outgoing.map((rel) => (
              <div key={rel.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg group">
                <span className="text-sm font-medium text-gray-900">{ci.name}</span>
                <Badge value={rel.relationship_type} />
                <span className="text-gray-400">&rarr;</span>
                <Link to={`/cmdb/${rel.target_ci_id}`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                  {rel.target_display_name || rel.target_name}
                </Link>
                {rel.notes && <span className="text-xs text-gray-400 italic ml-auto hidden sm:inline">{rel.notes}</span>}
                {canEdit && (
                  <button
                    onClick={() => handleDeleteRelationship(rel.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity"
                    title={tCmdb('removeRelationship')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Incoming */}
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">
          {tCmdb('incomingRelationships')}
          <span className="ml-2 text-xs font-normal text-gray-400">({ci.relationships.incoming.length})</span>
        </h3>
        {ci.relationships.incoming.length === 0 ? (
          <p className="text-sm text-gray-400">{tCmdb('noIncomingRelationships')}</p>
        ) : (
          <div className="space-y-2">
            {ci.relationships.incoming.map((rel) => (
              <div key={rel.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg group">
                <Link to={`/cmdb/${rel.source_ci_id}`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                  {rel.source_display_name || rel.source_name}
                </Link>
                <span className="text-gray-400">&rarr;</span>
                <Badge value={rel.relationship_type} />
                <span className="text-gray-400">&rarr;</span>
                <span className="text-sm font-medium text-gray-900">{ci.name}</span>
                {rel.notes && <span className="text-xs text-gray-400 italic ml-auto hidden sm:inline">{rel.notes}</span>}
                {canEdit && (
                  <button
                    onClick={() => handleDeleteRelationship(rel.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity"
                    title={tCmdb('removeRelationship')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
