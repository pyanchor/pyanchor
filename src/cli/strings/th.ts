/** Thai CLI strings. Tech terms intentionally kept in English. */
export const strings: Record<string, string> = {
  "common.ok": "ok",
  "common.fail": "ล้มเหลว",
  "common.warn": "คำเตือน",

  "doctor.title": "pyanchor doctor — วินิจฉัยการตั้งค่าท้องถิ่น",
  "doctor.subtitle":
    "(ไม่เริ่ม sidecar; ตรวจสอบเฉพาะสิ่งที่จะเห็นเมื่อเริ่ม)",
  "doctor.dotenv.loaded": "โหลด: {files} (cwd dotenv autoload)",
  "doctor.group.required": "Environment variables ที่จำเป็น",
  "doctor.group.fs": "ระบบไฟล์",
  "doctor.group.agent": "Agent",
  "doctor.group.outputMode": "โหมด output: {mode}",
  "doctor.group.optional": "การตั้งค่าตัวเลือก",
  "doctor.summary.allOk":
    "การตรวจสอบที่จำเป็นทั้งหมดผ่าน ({passed}/{total} ok{warnSuffix}). พร้อมรัน `pyanchor`",
  "doctor.summary.failed":
    "{failed} การตรวจสอบล้มเหลว, {warned} คำเตือน, {passed} ผ่าน (รวม {total}). แก้ไขรายการ ✗ ด้านบนแล้วรัน `pyanchor doctor` อีกครั้ง",
  "doctor.summary.warnSuffix": ", {warned} คำเตือน",
  "doctor.summary.accessControlHint":
    "สำหรับการกำหนดค่า access control (gate cookie, allowed origins, HMAC actor, การตั้งค่า production) ดู docs/ACCESS-CONTROL.md",

  "init.title": "pyanchor init — scaffolder แบบโต้ตอบ",
  "init.detected": "  ตรวจพบ: {summary}",
  "init.error.noPackageJson":
    "\nไม่มี package.json ในไดเรกทอรีนี้ รัน init จาก root ของแอป",
  "init.prompt.agent": "ต้องการใช้ agent ตัวไหน?",
  "init.prompt.workspaceDir":
    "ไดเรกทอรี Workspace (พื้นที่ scratch ที่ agent แก้ไขก่อน sync-back)",
  "init.prompt.restartApproach":
    "วิธี restart (จะ reload frontend อย่างไรหลังแก้ไขสำเร็จ?)",
  "init.prompt.pm2Name": "ชื่อ process pm2",
  "init.prompt.systemctlUnit": "ชื่อ unit systemd",
  "init.prompt.dockerContainer": "ชื่อ container docker",
  "init.prompt.port": "Port ของ sidecar",
  "init.prompt.portBusy":
    "Port ของ sidecar ({preferred} ถูกใช้งาน — แนะนำ {suggested})",
  "init.prompt.healthcheckUrl":
    "URL Healthcheck (คืนค่า 2xx เมื่อ frontend กลับมา)",
  "init.prompt.requireGate":
    "เปิดใช้ production gate cookie? (แนะนำสำหรับนอก localhost)",
  "init.prompt.outputMode": "โหมด output",
  "init.prompt.confirmApply": "นำการเปลี่ยนแปลงเหล่านี้ไปใช้?",
  "init.tokenReused":
    "  (ใช้ PYANCHOR_TOKEN ที่มีอยู่จาก {envFile} ซ้ำ — bootstrap snippet ด้านล่างตรงกับดิสก์)",
  "init.plan.header": "แผน:",
  "init.dryRun": "(dry run — ไม่มีการเขียนไฟล์)",
  "init.dryRun.nextSteps": "ขั้นตอนต่อไปนี้จะดำเนินการ:",
  "init.aborted": "ยกเลิก — ไม่มีการเขียนไฟล์",
  "init.done.header":
    "เสร็จ ขั้นตอนถัดไป (เราไม่ patch source files อัตโนมัติ — เสี่ยงเกินไป):",
  "init.done.quickCheck":
    "ตรวจสอบอย่างรวดเร็ว (โหลด .env ที่เพิ่งเขียนอัตโนมัติ):",
  "init.done.startSidecar": "จากนั้นเริ่ม sidecar:",
  "init.done.prodHint":
    "  # (Production: inject vars เดียวกันผ่าน systemd EnvironmentFile=, docker --env-file, pm2 ecosystem env เป็นต้น)",
  "init.claudeCode.note":
    "\n  หมายเหตุ: claude-code ใช้ in-process SDK (@anthropic-ai/claude-agent-sdk),\n             ไม่ใช่ binary หลัง init ให้รันเพิ่ม:\n          npm install @anthropic-ai/claude-agent-sdk\n          export ANTHROPIC_API_KEY=<key>   # หรือใช้ Claude OAuth flow\n             `pyanchor doctor` จะเตือนถ้าขาดอย่างใดอย่างหนึ่ง",
  "init.forceWarning.intro":
    "\n⚠️  --force ถูกเปิดใช้งาน PYANCHOR_TOKEN จะถูกสร้างใหม่",
  "init.forceWarning.update":
    "    อัปเดต data-pyanchor-token ใน bootstrap script tag ของคุณเป็นค่าใหม่ด้านล่าง,",
  "init.forceWarning.401":
    "    มิฉะนั้น overlay ของคุณจะได้รับ 401 ในทุกการเรียก API",

  "logs.title": "pyanchor logs — audit trail",
  "logs.error.notFound":
    "ไม่พบ audit log ที่ {path} ตั้งค่า PYANCHOR_AUDIT_LOG=true เพื่อเริ่มการเขียน",

  "agentTest.title": "pyanchor agent test — ping เดี่ยวของ adapter",
  "agentTest.summary.ok":
    "agent {agent} ตอบกลับใน {ms}ms Pipeline OK",
  "agentTest.summary.fail":
    "agent {agent} ไม่ตอบกลับอย่างถูกต้อง ดู output ด้านบน"
};
