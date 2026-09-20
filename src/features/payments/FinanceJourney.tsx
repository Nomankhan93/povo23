type FinanceStage = "earned" | "approved" | "available" | "withdrawal" | "settled";

const steps: readonly [FinanceStage, string, string][] = [
  ["earned", "Earn", "Complete verified paid work"],
  ["approved", "Approve", "Organization confirms entitlement"],
  ["available", "Available", "Approved unpaid balance becomes withdrawable"],
  ["withdrawal", "Withdraw", "Reserve earnings to a verified wallet"],
  ["settled", "Settled", "FieldLance records provider settlement"],
];

export function FinanceJourney({stage}:{stage:FinanceStage}){
  const activeIndex=Math.max(0,steps.findIndex(([value])=>value===stage));
  return <div className="finance-journey" aria-label="FieldLance earnings lifecycle">
    {steps.map(([value,label,copy],index)=><div key={value} className={index<=activeIndex?"active":""}>
      <span>{index+1}</span><div><strong>{label}</strong><small>{copy}</small></div>
    </div>)}
  </div>;
}
