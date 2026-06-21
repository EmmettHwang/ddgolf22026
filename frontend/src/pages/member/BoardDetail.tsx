import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { boardsService } from '../../services/boards';
import { useAuthStore } from '../../store/authStore';
import Loading from '../../components/common/Loading';
import ConfirmDialog, { useDialog } from '../../components/common/ConfirmDialog';

export default function BoardDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const { dialogState, showConfirm, handleConfirm, handleCancel } = useDialog();

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: () => boardsService.getPost(Number(id)),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => boardsService.deletePost(Number(id)),
    onSuccess: () => {
      navigate('/boards');
    },
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => boardsService.createComment(Number(id), content),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => boardsService.deleteComment(Number(id), commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const handleDelete = async () => {
    if (await showConfirm('정말 삭제하시겠습니까?')) {
      deleteMutation.mutate();
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim()) {
      commentMutation.mutate(comment);
    }
  };

  if (isLoading) return <Loading />;
  if (!post) return <div className="text-center py-12">게시글을 찾을 수 없습니다.</div>;

  const isAuthor = user?.id === post.author.id;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link to="/boards" className="text-primary-600 hover:text-primary-700 mb-4 inline-block">
        &larr; 목록으로
      </Link>

      <article className="card mb-8">
        <header className="border-b pb-4 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{post.title}</h1>
          <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
            <div className="flex gap-4">
              <span>작성자: {post.author.username}</span>
              <span>조회: {post.views}</span>
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
            {isAuthor && (
              <div className="flex gap-2">
                <Link to={`/boards/${id}/edit`} className="text-primary-600 hover:text-primary-700">
                  수정
                </Link>
                <button
                  onClick={handleDelete}
                  className="text-red-600 hover:text-red-700"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="prose max-w-none">
          <p className="whitespace-pre-wrap">{post.content}</p>
        </div>

        {post.images && post.images.length > 0 && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            {post.images.map((image) => (
              <img
                key={image.id}
                src={image.image}
                alt=""
                className="w-full h-48 object-cover rounded-lg"
              />
            ))}
          </div>
        )}
      </article>

      {/* Comments */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">
          댓글 {post.comments?.length || 0}개
        </h2>

        {user && (
          <form onSubmit={handleCommentSubmit} className="mb-6">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="input"
              rows={3}
              placeholder="댓글을 입력하세요"
            />
            <div className="flex justify-end mt-2">
              <button type="submit" className="btn btn-primary">
                댓글 작성
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {post.comments?.map((c) => (
            <div key={c.id} className="border-b pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">{c.author.username}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
                {user?.id === c.author.id && (
                  <button
                    onClick={() => deleteCommentMutation.mutate(c.id)}
                    className="text-red-600 text-sm hover:text-red-700"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="mt-2 text-gray-700">{c.content}</p>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={dialogState.open}
        title={dialogState.title}
        message={dialogState.message}
        type={dialogState.type}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
