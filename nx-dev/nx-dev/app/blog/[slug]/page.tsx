import { blogApi } from '../../../lib/blog.api';
import { BlogDetails } from '@nx/nx-dev/ui-blog';
import BlogDetailHeader from './header';

interface BlogPostDetailProps {
  params: { slug: string };
}

export async function generateStaticParams() {
  return (await blogApi.getBlogs()).map((post) => {
    return { slug: post.slug };
  });
}

export default async function BlogPostDetail({
  params: { slug },
}: BlogPostDetailProps) {
  const blog = await blogApi.getBlogPostBySlug(slug);
  return blog ? (
    <>
      {/* This empty div is necessary as app router does not automatically scroll on route changes */}
      <div></div>
      <BlogDetailHeader post={blog} />
      <BlogDetails post={blog} />
    </>
  ) : null;
}
