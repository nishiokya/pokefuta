'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import DeletePhotoModal from '@/components/DeletePhotoModal';

interface PhotoDeleteButtonProps {
  visitId: string;
  manholeId: number;
}

export default function PhotoDeleteButton({ visitId, manholeId }: PhotoDeleteButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push(`/manhole/${manholeId}`);
      } else {
        alert(`削除に失敗しました: ${data.error || '不明なエラー'}`);
        setIsDeleting(false);
        setModalOpen(false);
      }
    } catch {
      alert('削除中にエラーが発生しました');
      setIsDeleting(false);
      setModalOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-600 shadow-sm transition hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
        削除
      </button>
      <DeletePhotoModal
        isOpen={modalOpen}
        onConfirm={handleConfirm}
        onCancel={() => setModalOpen(false)}
        isDeleting={isDeleting}
      />
    </>
  );
}
