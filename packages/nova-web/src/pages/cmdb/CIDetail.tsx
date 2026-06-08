/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { useCIDetail } from './useCIDetail';
import CiDetailsTab from './CiDetailsTab';
import CiRelationshipsTab from './CiRelationshipsTab';
import CiHistoryTab from './CiHistoryTab';
import CiImpactTab from './CiImpactTab';

export default function CIDetail() {
  const {
    id,
    navigate,
    canEdit,
    ci,
    refNames,
    history,
    impact,
    relatedProblems,
    activeTab,
    setActiveTab,
    loading,
    loadError,
    prevId,
    nextId,
    navigateTo,
    showRelForm,
    setShowRelForm,
    relSaving,
    relError,
    relForm,
    setRelForm,
    ciSearch,
    setCiSearch,
    ciSearchResults,
    ciSearching,
    selectedFlowEdgeId,
    setSelectedFlowEdgeId,
    handleAddRelationship,
    handleDeleteRelationship,
    cancelRelForm,
  } = useCIDetail();

  const tCmdb = useTranslations('pages.cmdb');
  const tActions = useTranslations('common.actions');

  if (loading) return <Spinner />;
  if (!ci) {
    return (
      <>
        <PageHeader title={tCmdb('notFoundTitle')} description={tCmdb('notFoundDescription')} />
        <Card>
          <p className="text-sm text-gray-700 mb-4">
            {loadError || tCmdb('notFoundMessage')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/cmdb')}
            className="text-indigo-600 text-sm font-medium hover:text-indigo-800"
          >
            &larr; {tCmdb('backToCmdb')}
          </button>
        </Card>
      </>
    );
  }

  const tabs = [
    { key: 'details' as const, label: tCmdb('tabs.details') },
    { key: 'relationships' as const, label: tCmdb('tabs.relationships', { count: ci.relationships.outgoing.length + ci.relationships.incoming.length }) },
    { key: 'history' as const, label: tCmdb('tabs.history', { count: history.length }) },
    { key: 'impact' as const, label: tCmdb('tabs.impact', { count: impact.length }) },
  ];

  return (
    <>
      <PageHeader
        title={ci.display_name || ci.name}
        description={`${ci.class_display_name} · ${ci.name}`}
        action={
          <div className="flex gap-2 items-center">
            {(prevId || nextId) && (
              <>
                <button
                  disabled={!prevId}
                  onClick={() => prevId && navigateTo(prevId)}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={tCmdb('previousCi')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  disabled={!nextId}
                  onClick={() => nextId && navigateTo(nextId)}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={tCmdb('nextCi')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            {canEdit && (
              <button
                onClick={() => navigate(`/cmdb/${id}/edit`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {tActions('edit')}
              </button>
            )}
            <button onClick={() => navigate('/cmdb')} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">&larr; {tActions('back')}</button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <CiDetailsTab ci={ci} refNames={refNames} relatedProblems={relatedProblems} />
      )}

      {activeTab === 'relationships' && (
        <CiRelationshipsTab
          ci={ci}
          canEdit={canEdit}
          selectedFlowEdgeId={selectedFlowEdgeId}
          setSelectedFlowEdgeId={setSelectedFlowEdgeId}
          handleDeleteRelationship={handleDeleteRelationship}
          showRelForm={showRelForm}
          setShowRelForm={setShowRelForm}
          relError={relError}
          relForm={relForm}
          setRelForm={setRelForm}
          ciSearch={ciSearch}
          setCiSearch={setCiSearch}
          ciSearchResults={ciSearchResults}
          ciSearching={ciSearching}
          relSaving={relSaving}
          handleAddRelationship={handleAddRelationship}
          cancelRelForm={cancelRelForm}
        />
      )}

      {activeTab === 'history' && <CiHistoryTab history={history} />}

      {activeTab === 'impact' && <CiImpactTab impact={impact} ciName={ci.name} />}
    </>
  );
}
