import type { PatientVitals } from "@emulos/types";
import styles from "./VitalsPanel.module.css";

type VitalStatus = "ok" | "warning" | "critical";

function hrStatus(hr: number): VitalStatus {
  if (hr < 50 || hr > 130) return "critical";
  if (hr < 60 || hr > 100) return "warning";
  return "ok";
}

function bpStatus(systolic: number, diastolic: number): VitalStatus {
  if (systolic < 80 || systolic > 180 || diastolic < 50) return "critical";
  if (systolic < 90 || systolic > 150 || diastolic > 100) return "warning";
  return "ok";
}

function rrStatus(rr: number): VitalStatus {
  if (rr < 8 || rr > 30) return "critical";
  if (rr < 12 || rr > 20) return "warning";
  return "ok";
}

function spo2Status(spo2: number): VitalStatus {
  if (spo2 < 90) return "critical";
  if (spo2 < 94) return "warning";
  return "ok";
}

function tempStatus(temp: number): VitalStatus {
  if (temp < 35 || temp > 39.5) return "critical";
  if (temp < 36.1 || temp > 38.3) return "warning";
  return "ok";
}

function gcsStatus(level: PatientVitals["consciousness"]): VitalStatus {
  if (level === "unresponsive") return "critical";
  if (level === "drowsy") return "warning";
  if (level === "confused") return "warning";
  return "ok";
}

const GCS_LABEL: Record<PatientVitals["consciousness"], string> = {
  alert: "Alert",
  confused: "Confused",
  drowsy: "Drowsy",
  unresponsive: "Unresponsive",
};

interface VitalItemProps {
  label: string;
  value: string;
  unit?: string;
  status: VitalStatus;
}

function VitalItem({ label, value, unit, status }: VitalItemProps) {
  return (
    <div
      className={`${styles.item} ${styles[`status_${status}`]}`}
      aria-label={`${label}: ${value}${unit ?? ""}`}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
    </div>
  );
}

interface Props {
  vitals: PatientVitals;
}

export function VitalsPanel({ vitals }: Props) {
  return (
    <section className={styles.root} aria-label="Patient vitals" role="region">
      <VitalItem
        label="HR"
        value={String(Math.round(vitals.heartRate))}
        unit=" bpm"
        status={hrStatus(vitals.heartRate)}
      />
      <VitalItem
        label="BP"
        value={`${Math.round(vitals.bloodPressure.systolic)}/${Math.round(vitals.bloodPressure.diastolic)}`}
        unit=" mmHg"
        status={bpStatus(
          vitals.bloodPressure.systolic,
          vitals.bloodPressure.diastolic,
        )}
      />
      <VitalItem
        label="RR"
        value={String(Math.round(vitals.respiratoryRate))}
        unit=" /min"
        status={rrStatus(vitals.respiratoryRate)}
      />
      <VitalItem
        label="SpO₂"
        value={String(Math.round(vitals.oxygenSaturation))}
        unit="%"
        status={spo2Status(vitals.oxygenSaturation)}
      />
      <VitalItem
        label="Temp"
        value={vitals.temperature.toFixed(1)}
        unit="°C"
        status={tempStatus(vitals.temperature)}
      />
      <VitalItem
        label="GCS"
        value={GCS_LABEL[vitals.consciousness]}
        status={gcsStatus(vitals.consciousness)}
      />
    </section>
  );
}
