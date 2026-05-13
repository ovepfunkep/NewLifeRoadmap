import { motion } from 'framer-motion';
import { FiTrash2 } from 'react-icons/fi';
import type { Node } from '../../types';

/** Tear-apart delete animation overlay (mount only when `effectsEnabled` is true). */
export function NodeCardBurnOverlay(props: { node: Node }) {
  const { node } = props;

  return (
    <div className="pointer-events-none absolute inset-0 z-[60] overflow-visible">
      <motion.div
        className="absolute inset-0 z-[70] bg-white shadow-[0_0_15px_white] dark:bg-gray-200 dark:shadow-[0_0_15px_rgba(255,255,255,0.5)]"
        style={{
          clipPath:
            'polygon(45% 0%, 55% 0%, 40% 20%, 50% 40%, 35% 60%, 45% 80%, 35% 100%, 30% 100%, 40% 80%, 30% 60%, 45% 40%, 35% 20%, 45% 0%)',
          width: '4px',
          left: '50%',
          marginLeft: '-2px',
          originY: 0,
        }}
        initial={{ scaleY: 0, opacity: 1 }}
        animate={{
          scaleY: [0, 1.2, 1.2],
          opacity: [1, 1, 0],
        }}
        transition={{
          duration: 0.4,
          times: [0, 0.5, 1],
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="absolute inset-y-0 left-0 w-1/2 rounded-l-lg bg-white shadow-xl dark:bg-gray-800"
        style={{
          clipPath: 'polygon(0% 0%, 100% 0%, 85% 20%, 100% 40%, 80% 60%, 100% 80%, 90% 100%, 0% 100%)',
          backgroundColor: node.completed ? 'rgba(var(--accent-rgb), 0.05)' : undefined,
        }}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{
          x: [0, -20, -150],
          y: [0, 0, 800],
          rotate: [0, -2, -35],
        }}
        transition={{
          duration: 1.2,
          times: [0, 0.3, 1],
          ease: [0.45, 0, 0.55, 1],
          delay: 0.2,
        }}
      >
        <div className="w-[200%] p-4">
          <span className="font-semibold" style={{ color: 'var(--accent)' }}>
            {node.title}
          </span>
        </div>
      </motion.div>

      <motion.div
        className="absolute inset-y-0 right-0 w-1/2 rounded-r-lg bg-white shadow-xl dark:bg-gray-800"
        style={{
          clipPath: 'polygon(15% 0%, 100% 0%, 100% 100%, 10% 100%, 20% 80%, 0% 60%, 15% 40%, 0% 20%)',
          backgroundColor: node.completed ? 'rgba(var(--accent-rgb), 0.05)' : undefined,
        }}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{
          x: [0, 20, 180],
          y: [0, 0, 850],
          rotate: [0, 2, 45],
        }}
        transition={{
          duration: 1.2,
          times: [0, 0.3, 1],
          ease: [0.45, 0, 0.55, 1],
          delay: 0.2,
        }}
      >
        <div className="-ml-[100%] w-[200%] p-4">
          <div className="flex justify-end pr-10">
            <FiTrash2 size={24} color="#ef4444" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
