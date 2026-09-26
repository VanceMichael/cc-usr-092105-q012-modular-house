// 读取并验证项目共享的领域资料。
export function parseDomain(raw) {
  const value = JSON.parse(raw);
  const complete = value.domain && value.version > 0 && Array.isArray(value.facts) && value.facts.length > 0 && Array.isArray(value.entities) && value.entities.length > 0 && Array.isArray(value.rules) && value.rules.length > 0 && value.sample;
  if (!complete) throw new Error('领域资料缺少必要字段');
  return value;
}

// 扫描箱号：返回该箱的户型版本、检测证书、生产者、部件来源与当前缺件联系人。
export function resolveBox(value, boxId) {
  const s = value.sample;
  const box = s.boxes.find((b) => b.box_id === boxId);
  if (!box) throw new Error(`未知箱号: ${boxId}`);
  const mod = s.modules.find((m) => m.module_id === box.module_id);
  if (!mod) throw new Error(`箱号 ${boxId} 未关联生产模块`);
  const design = s.design_versions.find((d) => d.design_version_id === mod.design_version_id);
  if (!design) throw new Error(`模块 ${mod.module_id} 未关联设计版本`);
  const adaptation = s.adaptation_versions.find((a) => a.base_design_version_id === design.design_version_id);
  if (!adaptation) throw new Error(`设计版本 ${design.design_version_id} 缺少国家适配版本`);
  const certificates = s.certificates.filter((c) => c.adaptation_version_id === adaptation.adaptation_version_id);
  const parts = box.contents.map((group) => {
    const source = s.part_sources.find((p) => p.part_group === group);
    return { part_group: group, supplier: source ? source.supplier : null };
  });
  // 缺件联系人随交接记录追加而变化：默认生产者，服务站接管或售后责任变更后找最新责任方。
  let contact = mod.producer;
  for (const handover of s.handovers) {
    const involved = !Array.isArray(handover.box_ids) || handover.box_ids.includes(boxId);
    if (involved && (handover.kind === '服务站接管' || handover.kind === '售后责任变更') && handover.to_party) {
      contact = handover.to_party;
    }
  }
  return {
    box_id: box.box_id,
    module_id: mod.module_id,
    design_version_id: design.design_version_id,
    floor_plan: design.floor_plan,
    adaptation_version_id: adaptation.adaptation_version_id,
    standards: adaptation.compliance,
    certificates,
    producer: mod.producer,
    parts,
    missing_parts_contact: contact,
  };
}

// 数量守恒：各企业容量锁定合计等于投产模块数，分批装运的箱号不重不漏。
export function checkConservation(value) {
  const s = value.sample;
  const locked = s.capacity_locks.reduce((sum, lock) => sum + lock.quantity, 0);
  const perCompany = s.capacity_locks.every((lock) => s.modules.filter((m) => m.producer === lock.company).length === lock.quantity);
  const shipped = s.shipments.flatMap((sh) => sh.box_ids);
  const unique = new Set(shipped);
  const everyBoxShipped = s.boxes.every((b) => unique.has(b.box_id));
  return {
    locked,
    modules: s.modules.length,
    boxes: s.boxes.length,
    shipped: shipped.length,
    conserved: locked === s.modules.length && perCompany && unique.size === shipped.length && shipped.length === s.boxes.length && everyBoxShipped,
  };
}
