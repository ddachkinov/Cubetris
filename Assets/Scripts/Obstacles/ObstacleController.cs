using UnityEngine;
using System.Collections;

namespace Cubetris
{
    /// <summary>
    /// Controls obstacle behavior that blocks tracks temporarily.
    /// Obstacles can appear randomly based on level configuration.
    /// </summary>
    public class ObstacleController : MonoBehaviour
    {
        [Header("Obstacle Settings")]
        [SerializeField] private int blockedTrack = 0;
        [SerializeField] private float blockDuration = 5f;
        [SerializeField] private float warningTime = 1f;

        [Header("Visual Feedback")]
        [SerializeField] private Color normalColor = new Color(0.5f, 0.5f, 0.5f);
        [SerializeField] private Color warningColor = Color.yellow;
        [SerializeField] private Color blockColor = Color.red;

        [Header("Movement")]
        [SerializeField] private bool isMoving = false;
        [SerializeField] private float moveSpeed = 2f;
        [SerializeField] private Vector3 targetPosition;

        private Renderer obstacleRenderer;
        private MaterialPropertyBlock propertyBlock;
        private bool isActive = false;
        private float activationTime;

        private void Awake()
        {
            obstacleRenderer = GetComponent<Renderer>();
            propertyBlock = new MaterialPropertyBlock();
        }

        /// <summary>
        /// Activate obstacle on a specific track.
        /// </summary>
        public void Activate(int trackIndex, Vector3 position, float duration)
        {
            blockedTrack = trackIndex;
            blockDuration = duration;
            transform.position = position;
            targetPosition = position;

            isActive = true;
            activationTime = Time.time;

            // Set warning color
            SetColor(warningColor);

            // Start block sequence
            StartCoroutine(BlockSequence());

            Debug.Log($"Obstacle activated on track {trackIndex} for {duration} seconds");
        }

        /// <summary>
        /// Obstacle block sequence: warning -> block -> deactivate.
        /// </summary>
        private IEnumerator BlockSequence()
        {
            // Warning phase
            SetColor(warningColor);
            yield return new WaitForSeconds(warningTime);

            // Block phase
            SetColor(blockColor);
            float blockTime = blockDuration - warningTime;
            yield return new WaitForSeconds(blockTime);

            // Deactivate
            Deactivate();
        }

        /// <summary>
        /// Deactivate and remove obstacle.
        /// </summary>
        public void Deactivate()
        {
            isActive = false;

            // Fade out or destroy
            Destroy(gameObject, 0.5f);

            Debug.Log($"Obstacle deactivated on track {blockedTrack}");
        }

        /// <summary>
        /// Set obstacle color.
        /// </summary>
        private void SetColor(Color color)
        {
            if (obstacleRenderer != null)
            {
                obstacleRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", color);
                obstacleRenderer.SetPropertyBlock(propertyBlock);
            }
        }

        /// <summary>
        /// Check if this obstacle is blocking a specific track.
        /// </summary>
        public bool IsBlockingTrack(int trackIndex)
        {
            return isActive && blockedTrack == trackIndex;
        }

        // Public getters
        public bool IsActive => isActive;
        public int BlockedTrack => blockedTrack;
    }
}
