import DataManagement from "@/components/data-management";

export default function Data() {
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Data Management</h2>
        <p className="text-gray-600 text-sm">Backup and manage your training data</p>
      </div>
      
      <DataManagement />
    </div>
  );
}