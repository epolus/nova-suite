-- Vendor-neutral CI class hierarchy.
-- Fresh installs already have this model in init.sql. This file fills existing databases:
-- the parent index, a self-parent check, missing standard classes, and parent links
-- only where a class does not already have a parent.
-- Existing attribute definitions are left unchanged.
-- Vendor, cloud-product, telecom, mainframe, and medical classes from the
-- ServiceNow CI Class Models store app are intentionally not added.

CREATE INDEX IF NOT EXISTS idx_ci_classes_parent ON ci_classes(parent_class);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ci_classes_parent_not_self'
  ) THEN
    ALTER TABLE ci_classes
      ADD CONSTRAINT ci_classes_parent_not_self
      CHECK (parent_class IS DISTINCT FROM id);
  END IF;
END $$;

INSERT INTO ci_classes (tenant_id, name, display_name, description, attributes, icon, is_active)
SELECT t.id, v.name, v.display_name, v.description, v.attributes::jsonb, v.icon, true
FROM tenants t
CROSS JOIN (VALUES
  ('configuration_item', 'Configuration Item', 'Root of the configuration model. Every other class extends this.', '{}', 'other'),
  ('hardware', 'Hardware', 'Physical equipment. Manufacturer and asset identity live here.', '{"manufacturer": {"type": "string"}, "model": {"type": "string"}, "serial_number": {"type": "string"}, "asset_tag": {"type": "string"}}', 'server'),
  ('computer', 'Computer', 'A machine that runs an operating system, physical or virtual.', '{"os": {"type": "string"}, "cpu_cores": {"type": "integer"}, "ram_gb": {"type": "integer"}}', 'laptop'),
  ('network_gear', 'Network Gear', 'Network equipment. Product line and vendor stay in attributes, not separate classes.', '{"ip_address": {"type": "string"}, "firmware_version": {"type": "string"}}', 'wifi'),
  ('software', 'Software', 'Installed or hosted software. Version is shared by every software class.', '{"version": {"type": "string"}}', 'globe'),
  ('virtual_machine', 'Virtual Machine', 'Virtual machine. The hypervisor product is an attribute, not a class.', '{"ip_address": {"type": "string"}, "virtualization": {"type": "string"}}', 'cloud'),
  ('desktop', 'Desktop', 'Desktop workstation.', '{}', 'monitor'),
  ('handheld', 'Handheld', 'Phone or tablet. The device maker is an attribute, not a class.', '{"phone_number": {"type": "string"}}', 'phone'),
  ('router', 'Router', 'IP router.', '{}', 'wifi'),
  ('switch', 'Switch', 'Network switch.', '{}', 'wifi'),
  ('firewall', 'Firewall', 'Network firewall. Vendor and model are attributes.', '{}', 'wifi'),
  ('load_balancer', 'Load Balancer', 'Load balancer. The product name is an attribute.', '{}', 'wifi'),
  ('wireless_access_point', 'Wireless Access Point', 'Wireless access point.', '{}', 'wifi'),
  ('printer', 'Printer', 'Printer or multifunction device.', '{"printer_type": {"type": "string"}}', 'printer'),
  ('storage_device', 'Storage Device', 'Disk array or other storage system.', '{"capacity_gb": {"type": "integer"}}', 'storage'),
  ('display', 'Display', 'Monitor or other display device.', '{"size_inches": {"type": "number"}}', 'monitor'),
  ('unclassified_hardware', 'Unclassified Hardware', 'Hardware that cannot be classified yet.', '{}', 'other'),
  ('rack', 'Rack', 'Equipment rack.', '{"units": {"type": "integer"}}', 'storage'),
  ('api', 'API', 'An API exposed by an application. Gateway products are not separate classes.', '{"base_url": {"type": "string"}}', 'globe'),
  ('business_service', 'Business Service', 'Business or technical service tracked for dependency and impact. This is not a catalog item.', '{"tier": {"type": "string"}}', 'other'),
  ('cluster', 'Cluster', 'Group of nodes that provide one function.', '{"node_count": {"type": "integer"}}', 'server'),
  ('certificate', 'Certificate', 'X.509 certificate tracked as a configuration item.', '{"subject": {"type": "string"}, "issuer": {"type": "string"}, "expires_on": {"type": "string"}}', 'other'),
  ('ip_network', 'IP Network', 'IP subnet or VLAN.', '{"cidr": {"type": "string"}, "vlan": {"type": "integer"}, "gateway": {"type": "string"}}', 'wifi')
) AS v(name, display_name, description, attributes, icon)
WHERE NOT EXISTS (
  SELECT 1 FROM ci_classes c
  WHERE c.tenant_id = t.id AND c.name = v.name
);

-- Link the standard tree one class at a time. Skip a link that is already set
-- or that would make a class an ancestor of itself.
DO $$
DECLARE
  link record;
BEGIN
  FOR link IN
    SELECT child.id AS child_id, parent.id AS parent_id
    FROM ci_classes AS child
    JOIN ci_classes AS parent
      ON parent.tenant_id = child.tenant_id
    JOIN (VALUES
      ('hardware', 'configuration_item'),
      ('software', 'configuration_item'),
      ('business_service', 'configuration_item'),
      ('cluster', 'configuration_item'),
      ('certificate', 'configuration_item'),
      ('ip_network', 'configuration_item'),
      ('computer', 'hardware'),
      ('network_gear', 'hardware'),
      ('printer', 'hardware'),
      ('storage_device', 'hardware'),
      ('display', 'hardware'),
      ('unclassified_hardware', 'hardware'),
      ('rack', 'hardware'),
      ('server', 'computer'),
      ('virtual_machine', 'computer'),
      ('laptop', 'computer'),
      ('desktop', 'computer'),
      ('handheld', 'computer'),
      ('network_device', 'network_gear'),
      ('router', 'network_gear'),
      ('switch', 'network_gear'),
      ('firewall', 'network_gear'),
      ('load_balancer', 'network_gear'),
      ('wireless_access_point', 'network_gear'),
      ('application', 'software'),
      ('database', 'software'),
      ('api', 'software')
    ) AS rel(child_name, parent_name)
      ON child.name = rel.child_name
     AND parent.name = rel.parent_name
    WHERE child.parent_class IS NULL
      AND child.id <> parent.id
  LOOP
    IF NOT EXISTS (
      WITH RECURSIVE chain AS (
        SELECT id, parent_class, 1 AS depth
        FROM ci_classes
        WHERE id = link.parent_id
        UNION ALL
        SELECT c.id, c.parent_class, chain.depth + 1
        FROM ci_classes c
        JOIN chain ON c.id = chain.parent_class
        WHERE chain.parent_class IS NOT NULL AND chain.depth < 50
      )
      SELECT 1 FROM chain WHERE id = link.child_id
    ) THEN
      UPDATE ci_classes
      SET parent_class = link.parent_id,
          updated_at = now()
      WHERE id = link.child_id
        AND parent_class IS NULL;
    END IF;
  END LOOP;
END $$;
