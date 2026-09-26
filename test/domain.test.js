import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDomain, resolveBox, checkConservation } from '../src/domain.js';

const load = async () => parseDomain(await readFile(new URL('../fixtures/domain.json', import.meta.url), 'utf8'));

test('样例领域资料完整且符合交换合同', async () => {
  const value = await load();
  const schema = JSON.parse(await readFile(new URL('../contracts/domain.schema.json', import.meta.url), 'utf8'));
  assert.equal(value.domain, 'modular-house');
  assert.ok(value.version >= 2);
  assert.ok(value.entities.length >= 3);
  assert.ok(value.rules.length >= 3);
  for (const key of schema.required) assert.ok(key in value, `缺少 ${key}`);
  for (const key of schema.properties.sample.required) assert.ok(key in value.sample, `样例缺少 ${key}`);
});

test('短视频询盘确认前不进入生产', async () => {
  const { sample } = await load();
  const configurations = new Map(sample.configurations.map((c) => [c.configuration_id, c]));
  const pending = sample.inquiries.filter((i) => i.status !== '已转确认配置');
  assert.ok(pending.length > 0);
  for (const inquiry of pending) assert.equal(inquiry.configuration_id, null);
  for (const mod of sample.modules) {
    assert.equal(configurations.get(mod.configuration_id)?.status, '双方确认');
  }
});

test('已投产模块继续服从原设计', async () => {
  const { sample } = await load();
  const versions = new Map(sample.design_versions.map((d) => [d.design_version_id, d]));
  assert.ok(sample.design_versions.some((d) => d.status === '未投产批次适用'));
  for (const mod of sample.modules) {
    assert.equal(versions.get(mod.design_version_id)?.status, '已投产冻结');
  }
});

test('国家适配形成独立合规版本并挂检测证书', async () => {
  const { sample } = await load();
  const designIds = new Set(sample.design_versions.map((d) => d.design_version_id));
  for (const adaptation of sample.adaptation_versions) {
    assert.ok(adaptation.adaptation_version_id);
    assert.ok(designIds.has(adaptation.base_design_version_id));
    assert.ok(adaptation.compliance.length > 0);
  }
  const adaptationIds = new Set(sample.adaptation_versions.map((a) => a.adaptation_version_id));
  const kinds = new Set(sample.certificates.map((c) => c.kind));
  assert.ok(kinds.has('防火') && kinds.has('抗震'));
  for (const cert of sample.certificates) assert.ok(adaptationIds.has(cert.adaptation_version_id));
});

test('扫描箱号追溯户型、证书、生产者与缺件联系人', async () => {
  const value = await load();
  const result = resolveBox(value, 'BOX-DEMO-0001');
  assert.equal(result.design_version_id, 'DV-DEMO-004');
  assert.ok(result.floor_plan.includes('户型'));
  const kinds = result.certificates.map((c) => c.kind);
  assert.ok(kinds.includes('防火') && kinds.includes('抗震'));
  assert.equal(result.producer, '示例钢构企业');
  assert.equal(result.missing_parts_contact, '示例海外服务站');
  assert.ok(result.parts.every((p) => p.supplier));
  assert.throws(() => resolveBox(value, 'BOX-DEMO-9999'), /未知箱号/);
});

test('容量锁定与分批装运数量守恒', async () => {
  const value = await load();
  const result = checkConservation(value);
  assert.equal(result.locked, result.modules);
  assert.equal(result.shipped, result.boxes);
  assert.ok(result.conserved);
});

test('延误、接管、补发与责任变更均追加交接记录', async () => {
  const { sample } = await load();
  const kinds = new Set(sample.handovers.map((h) => h.kind));
  for (const kind of ['海运延误', '服务站接管', '补发', '售后责任变更']) {
    assert.ok(kinds.has(kind), `缺少${kind}交接`);
  }
  for (const handover of sample.handovers) {
    assert.ok(handover.handover_id && handover.at && handover.note);
  }
  const chronological = [...sample.handovers].sort((a, b) => a.at.localeCompare(b.at));
  assert.deepEqual(
    sample.handovers.map((h) => h.handover_id),
    chronological.map((h) => h.handover_id),
  );
});

test('多语种客户视图不展示未确认承诺', async () => {
  const { sample } = await load();
  const view = sample.customer_view;
  assert.ok(view.languages.length >= 2);
  const knownIds = new Set([
    ...sample.configurations.map((c) => c.configuration_id),
    ...sample.quotes.map((q) => q.quote_id),
    ...sample.design_versions.map((d) => d.design_version_id),
    ...sample.adaptation_versions.map((a) => a.adaptation_version_id),
    ...sample.shipments.map((s) => s.shipment_id),
  ]);
  const shown = new Set();
  for (const entry of view.entries) {
    assert.equal(entry.confirmed, true);
    assert.ok(knownIds.has(entry.source_id), `视图引用了未知来源 ${entry.source_id}`);
    shown.add(entry.key);
  }
  for (const item of view.withheld) assert.ok(!shown.has(item.key));
});
