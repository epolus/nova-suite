-- SPDX-License-Identifier: AGPL-3.0-only
-- ============================================================
-- Nova Suite – Bulk Demo Data for UI Performance Testing
-- Generates ~500 incidents, ~200 requests, ~80 CIs, journal entries
-- ============================================================

-- Set tenant context for inserts
SELECT set_config('app.current_tenant_id', 'a0000000-0000-0000-0000-000000000001', false);
SELECT set_config('app.current_user_id', 'b0000000-0000-0000-0000-000000000001', false);
SELECT set_config('app.current_user_roles', 'admin', false);

-- ─── Helper variables ───
DO $$
DECLARE
  tenant_id uuid := 'a0000000-0000-0000-0000-000000000001';
  admin_id uuid := 'b0000000-0000-0000-0000-000000000001';
  fulfiller_id uuid := 'b0000000-0000-0000-0000-000000000002';
  user_id uuid := 'b0000000-0000-0000-0000-000000000003';
  network_id uuid := 'b0000000-0000-0000-0000-000000000005';
  dba_id uuid := 'b0000000-0000-0000-0000-000000000006';
  appsupport_id uuid := 'b0000000-0000-0000-0000-000000000007';
  sales_id uuid := 'b0000000-0000-0000-0000-000000000009';
  finance_id uuid := 'b0000000-0000-0000-0000-000000000010';

  -- CI class IDs
  server_class uuid := 'e0000000-0000-0000-0000-000000000001';
  app_class uuid := 'e0000000-0000-0000-0000-000000000002';
  db_class uuid := 'e0000000-0000-0000-0000-000000000003';
  network_class uuid := 'e0000000-0000-0000-0000-000000000004';

  -- Service item IDs
  laptop_item uuid := 'd0000000-0000-0000-0000-000000000001';
  software_item uuid := 'd0000000-0000-0000-0000-000000000002';
  account_item uuid := 'd0000000-0000-0000-0000-000000000003';
  general_item uuid := 'd0000000-0000-0000-0000-000000000004';

  i integer;
  inc_id uuid;
  req_id uuid;
  ci_id uuid;
  new_ci_ids uuid[] := '{}';
  statuses incident_status_enum[] := ARRAY[
    'new'::incident_status_enum,
    'assigned'::incident_status_enum,
    'in_progress'::incident_status_enum,
    'pending'::incident_status_enum,
    'resolved'::incident_status_enum,
    'closed'::incident_status_enum
  ];
  req_statuses text[] := ARRAY['submitted','pending_approval','approved','in_progress','fulfilled','cancelled'];
  impacts text[] := ARRAY['low','medium','high'];
  urgencies text[] := ARRAY['low','medium','high'];
  impact_val text;
  urgency_val text;
  priority_val integer;
  status_val incident_status_enum;
  service_val uuid;
  ci_val uuid;
  group_val uuid;
  assignee_val uuid;
  resolved_val timestamptz;
  closed_val timestamptz;
  pending_reason_val text;
  envs text[] := ARRAY['production','staging','development','test'];
  ci_statuses ci_status_enum[] := ARRAY[
    'active'::ci_status_enum,
    'active'::ci_status_enum,
    'active'::ci_status_enum,
    'maintenance'::ci_status_enum,
    'retired'::ci_status_enum,
    'planned'::ci_status_enum
  ];
  categories text[] := ARRAY['Network','Hardware','Software','Security','Email','Database','Storage','Backup','Printing','VPN'];
  pending_reasons text[] := ARRAY[
    'waiting_for_caller',
    'waiting_for_vendor',
    'waiting_for_change_window',
    'waiting_for_approval',
    'waiting_for_dependency'
  ];
  titles text[] := ARRAY[
    'Cannot connect to VPN',
    'Email not syncing on mobile',
    'Laptop screen flickering',
    'Application crash on startup',
    'Slow network in Building A',
    'Printer jammed on 3rd floor',
    'Password reset required',
    'Software license expired',
    'Database connection timeout',
    'Disk space alert on server',
    'SSL certificate expiring soon',
    'Backup job failed overnight',
    'User locked out of account',
    'Monitor not detected after update',
    'Shared drive not accessible',
    'Outlook keeps crashing',
    'WiFi drops intermittently',
    'Blue screen on developer machine',
    'Jenkins build pipeline broken',
    'Docker container OOM killed',
    'Kubernetes pod crash loop',
    'Load balancer health check failing',
    'DNS resolution failing for internal',
    'Git push rejected by hook',
    'Staging environment down',
    'Production API latency spike',
    'Redis cache eviction rate high',
    'Elasticsearch cluster yellow',
    'Firewall blocking legitimate traffic',
    'MFA not working for new phone'
  ];
  server_names text[] := ARRAY['web-stg-01','web-stg-02','api-stg-01','worker-01','worker-02','worker-03','cache-01','cache-02','monitor-01','log-01','ci-runner-01','ci-runner-02','bastion-01','vpn-01','mail-01','dns-01','dns-02','nfs-01','backup-01','backup-02'];
  app_names text[] := ARRAY['billing-api','user-service','auth-gateway','notification-svc','search-engine','analytics-dashboard','admin-portal','mobile-backend','webhook-processor','scheduler','report-generator','file-upload-svc','audit-logger','config-server','feature-flags'];
  db_names text[] := ARRAY['pg-replica-01','pg-replica-02','mysql-legacy-01','redis-prod-02','redis-stg-01','mongo-analytics-01','elastic-node-01','elastic-node-02','elastic-node-03','influx-metrics-01'];
  net_names text[] := ARRAY['sw-floor-2','sw-floor-3','sw-floor-4','rt-branch-01','rt-branch-02','fw-stg-01','lb-internal-01','lb-internal-02','ap-floor-2-a','ap-floor-2-b','ap-floor-3-a'];
  assignees uuid[];
  requesters uuid[];
  assignment_groups uuid[];
  service_ids uuid[];
  items uuid[];
  rand_val double precision;
BEGIN
  assignees := ARRAY[admin_id, fulfiller_id, network_id, dba_id, appsupport_id];
  requesters := ARRAY[admin_id, fulfiller_id, user_id, sales_id, finance_id];
  assignment_groups := ARRAY[
    'a5000000-0000-0000-0000-000000000001'::uuid,
    'a5000000-0000-0000-0000-000000000002'::uuid,
    'a5000000-0000-0000-0000-000000000003'::uuid,
    'a5000000-0000-0000-0000-000000000004'::uuid,
    'a5000000-0000-0000-0000-000000000005'::uuid,
    'a5000000-0000-0000-0000-000000000006'::uuid
  ];
  service_ids := ARRAY[
    'a6000000-0000-0000-0000-000000000001'::uuid,
    'a6000000-0000-0000-0000-000000000002'::uuid,
    'a6000000-0000-0000-0000-000000000003'::uuid,
    'a6000000-0000-0000-0000-000000000004'::uuid,
    'a6000000-0000-0000-0000-000000000005'::uuid
  ];
  items := ARRAY[laptop_item, software_item, account_item, general_item];

  -- ═══════════════════════════════════════
  -- CONFIGURATION ITEMS (~80)
  -- ═══════════════════════════════════════

  -- Servers
  FOR i IN 1..array_length(server_names, 1) LOOP
    INSERT INTO configuration_items (tenant_id, class_id, name, display_name, status, environment, attributes, managed_by)
    VALUES (
      tenant_id, server_class, server_names[i],
      initcap(replace(server_names[i], '-', ' ')),
      ci_statuses[1 + floor(random() * array_length(ci_statuses, 1))::int],
      envs[1 + floor(random() * array_length(envs, 1))::int],
      json_build_object(
        'os', (ARRAY['Ubuntu 22.04','Ubuntu 24.04','RHEL 9','Debian 12','Alpine 3.19'])[1 + floor(random()*5)::int],
        'cpu_cores', (ARRAY[2,4,8,16,32])[1 + floor(random()*5)::int],
        'ram_gb', (ARRAY[4,8,16,32,64])[1 + floor(random()*5)::int],
        'ip_address', '10.0.' || (1 + floor(random()*10)::int) || '.' || (20 + i)
      )::jsonb,
      assignees[1 + floor(random() * array_length(assignees, 1))::int]
    ) RETURNING id INTO ci_id;
    new_ci_ids := array_append(new_ci_ids, ci_id);
  END LOOP;

  -- Applications
  FOR i IN 1..array_length(app_names, 1) LOOP
    INSERT INTO configuration_items (tenant_id, class_id, name, display_name, status, environment, attributes, managed_by)
    VALUES (
      tenant_id, app_class, app_names[i],
      initcap(replace(app_names[i], '-', ' ')),
      ci_statuses[1 + floor(random() * array_length(ci_statuses, 1))::int],
      envs[1 + floor(random() * array_length(envs, 1))::int],
      json_build_object(
        'version', (floor(random()*5)::int) || '.' || (floor(random()*20)::int) || '.' || (floor(random()*10)::int),
        'language', (ARRAY['TypeScript','Python','Go','Java','Rust'])[1 + floor(random()*5)::int],
        'port', 3000 + i,
        'url', 'https://' || app_names[i] || '.acme.local'
      )::jsonb,
      assignees[1 + floor(random() * array_length(assignees, 1))::int]
    ) RETURNING id INTO ci_id;
    new_ci_ids := array_append(new_ci_ids, ci_id);
  END LOOP;

  -- Databases
  FOR i IN 1..array_length(db_names, 1) LOOP
    INSERT INTO configuration_items (tenant_id, class_id, name, display_name, status, environment, attributes, managed_by)
    VALUES (
      tenant_id, db_class, db_names[i],
      initcap(replace(db_names[i], '-', ' ')),
      ci_statuses[1 + floor(random() * array_length(ci_statuses, 1))::int],
      envs[1 + floor(random() * array_length(envs, 1))::int],
      json_build_object(
        'engine', (ARRAY['PostgreSQL','MySQL','Redis','MongoDB','Elasticsearch','InfluxDB'])[1 + floor(random()*6)::int],
        'version', (floor(random()*5+12)::int) || '.' || (floor(random()*10)::int),
        'port', (ARRAY[5432,3306,6379,27017,9200,8086])[1 + floor(random()*6)::int],
        'max_connections', (ARRAY[100,200,500,1000])[1 + floor(random()*4)::int]
      )::jsonb,
      assignees[1 + floor(random() * array_length(assignees, 1))::int]
    ) RETURNING id INTO ci_id;
    new_ci_ids := array_append(new_ci_ids, ci_id);
  END LOOP;

  -- Network devices
  FOR i IN 1..array_length(net_names, 1) LOOP
    INSERT INTO configuration_items (tenant_id, class_id, name, display_name, status, environment, attributes, managed_by)
    VALUES (
      tenant_id, network_class, net_names[i],
      initcap(replace(net_names[i], '-', ' ')),
      ci_statuses[1 + floor(random() * array_length(ci_statuses, 1))::int],
      'production',
      json_build_object(
        'device_type', (ARRAY['switch','router','firewall','load_balancer','access_point'])[1 + floor(random()*5)::int],
        'ip_address', '10.0.0.' || (50 + i),
        'firmware_version', (floor(random()*3+6)::int) || '.' || (floor(random()*10)::int) || '.' || (floor(random()*5)::int)
      )::jsonb,
      assignees[1 + floor(random() * array_length(assignees, 1))::int]
    ) RETURNING id INTO ci_id;
    new_ci_ids := array_append(new_ci_ids, ci_id);
  END LOOP;

  -- Random CI relationships
  FOR i IN 1..60 LOOP
    BEGIN
      INSERT INTO ci_relationships (tenant_id, source_ci_id, target_ci_id, relationship_type)
      VALUES (
        tenant_id,
        new_ci_ids[1 + floor(random() * array_length(new_ci_ids, 1))::int],
        new_ci_ids[1 + floor(random() * array_length(new_ci_ids, 1))::int],
        (ARRAY['depends_on','used_by','runs_on','connected_to','part_of','manages'])[1 + floor(random()*6)::int]
      );
    EXCEPTION WHEN unique_violation OR check_violation THEN
      -- skip duplicates or self-references
      NULL;
    END;
  END LOOP;

  -- ═══════════════════════════════════════
  -- REQUESTS (~200)
  -- ═══════════════════════════════════════
  FOR i IN 1..200 LOOP
    INSERT INTO requests (
      tenant_id, number, requester_id, service_item_id,
      form_data, status, priority, notes, created_at
    ) VALUES (
      tenant_id,
      'REQ' || lpad((2000 + i)::text, 7, '0'),
      requesters[1 + floor(random() * array_length(requesters, 1))::int],
      items[1 + floor(random() * array_length(items, 1))::int],
      json_build_object('note', 'Auto-generated request #' || i)::jsonb,
      req_statuses[1 + floor(random() * array_length(req_statuses, 1))::int],
      (ARRAY['low','medium','high','critical'])[1 + floor(random()*4)::int],
      CASE WHEN random() > 0.5 THEN 'Additional context for request ' || i ELSE NULL END,
      now() - (random() * interval '90 days')
    ) RETURNING id INTO req_id;
  END LOOP;

  -- ═══════════════════════════════════════
  -- INCIDENTS (~500)
  -- ═══════════════════════════════════════
  FOR i IN 1..500 LOOP
    rand_val := random();
    impact_val := impacts[1 + floor(random() * 3)::int];
    urgency_val := urgencies[1 + floor(random() * 3)::int];
    priority_val := calculate_priority(impact_val, urgency_val);
    status_val := statuses[1 + floor(random() * array_length(statuses, 1))::int];
    group_val := assignment_groups[1 + floor(random() * array_length(assignment_groups, 1))::int];

    -- Every incident needs a service or CI (UI mandatory field)
    IF random() > 0.35 AND array_length(new_ci_ids, 1) > 0 THEN
      ci_val := new_ci_ids[1 + floor(random() * array_length(new_ci_ids, 1))::int];
      service_val := CASE WHEN random() > 0.6 THEN service_ids[1 + floor(random() * array_length(service_ids, 1))::int] ELSE NULL END;
    ELSE
      service_val := service_ids[1 + floor(random() * array_length(service_ids, 1))::int];
      ci_val := CASE WHEN random() > 0.6 AND array_length(new_ci_ids, 1) > 0 THEN new_ci_ids[1 + floor(random() * array_length(new_ci_ids, 1))::int] ELSE NULL END;
    END IF;

    assignee_val := CASE
      WHEN status_val = 'new' AND random() > 0.4 THEN NULL
      ELSE assignees[1 + floor(random() * array_length(assignees, 1))::int]
    END;

    resolved_val := NULL;
    closed_val := NULL;
    IF status_val IN ('resolved', 'closed') THEN
      resolved_val := now() - (random() * interval '30 days');
    END IF;
    IF status_val = 'closed' THEN
      closed_val := COALESCE(resolved_val, now() - (random() * interval '20 days')) + (random() * interval '3 days');
    END IF;

    pending_reason_val := CASE
      WHEN status_val = 'pending' THEN pending_reasons[1 + floor(random() * array_length(pending_reasons, 1))::int]
      ELSE NULL
    END;

    INSERT INTO incidents (
      tenant_id, number, title, description,
      status, impact, urgency, priority,
      assigned_to, assignment_group_id, caller_id,
      contact_info, service_id, configuration_item_id,
      category, resolution_code, sla_due_at, sla_breached,
      created_at, resolved_at, closed_at
    ) VALUES (
      tenant_id,
      'INC' || lpad((2000 + i)::text, 7, '0'),
      titles[1 + floor(random() * array_length(titles, 1))::int],
      'Auto-generated incident #' || i || '. ' ||
        CASE WHEN random() > 0.5 THEN 'Users are reporting issues since this morning. Multiple teams affected.' ELSE 'Single user report. Low business impact so far.' END,
      status_val,
      impact_val,
      urgency_val,
      priority_val,
      assignee_val,
      group_val,
      requesters[1 + floor(random() * array_length(requesters, 1))::int],
      'Ext. ' || (1000 + floor(random()*9000)::int) || ', Desk ' || chr(65 + floor(random()*8)::int) || floor(random()*400)::int,
      service_val,
      ci_val,
      categories[1 + floor(random() * array_length(categories, 1))::int],
      pending_reason_val,
      now() + (random() * interval '7 days') - (interval '2 days'),
      rand_val > 0.85,
      now() - (random() * interval '60 days'),
      resolved_val,
      closed_val
    ) RETURNING id INTO inc_id;

    -- Add 1-5 journal entries per incident
    FOR j IN 1..(1 + floor(random() * 5)::int) LOOP
      INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible, created_at)
      VALUES (
        tenant_id, inc_id,
        assignees[1 + floor(random() * array_length(assignees, 1))::int],
        (ARRAY['comment','work_note','state_change','assignment'])[1 + floor(random()*4)::int],
        (ARRAY[
          'Investigating the issue. Initial triage complete.',
          'Contacted the vendor for support. Awaiting response.',
          'Applied temporary workaround. Monitoring for recurrence.',
          'Root cause identified: configuration drift after last deployment.',
          'Escalated to Level 2 support.',
          'User confirmed the issue is resolved.',
          'Restarted the affected service. Checking logs.',
          'Rolled back to previous version. Stable now.',
          'Patch applied successfully. Running validation tests.',
          'Closed after 48h monitoring with no recurrence.'
        ])[1 + floor(random()*10)::int],
        random() > 0.3,
        now() - (random() * interval '30 days')
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Demo data created: ~% CIs, 200 requests, 500 incidents', array_length(new_ci_ids, 1);
END;
$$;
