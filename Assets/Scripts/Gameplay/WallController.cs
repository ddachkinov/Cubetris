using UnityEngine;

namespace Cubetris
{
    /// <summary>
    /// Controls the wall that pushes forward toward the player over time.
    /// Increases speed based on level configuration and triggers game over when reaching spawn area.
    /// </summary>
    public class WallController : MonoBehaviour
    {
        [Header("Wall Settings")]
        [SerializeField] private float currentSpeed = 0.02f;
        [SerializeField] private float speedRamp = 0.0f; // Speed increase per second
        [SerializeField] private Vector3 initialPosition;
        [SerializeField] private float gameOverZ = -10f; // Z position where game is over

        [Header("Movement")]
        [SerializeField] private bool isPushing = false;
        [SerializeField] private Vector3 moveDirection = Vector3.back; // Move toward player (-Z)

        [Header("Visual Feedback")]
        [SerializeField] private Color normalColor = Color.gray;
        [SerializeField] private Color warningColor = Color.red;
        [SerializeField] private float warningDistance = 5f;

        private Renderer wallRenderer;
        private MaterialPropertyBlock propertyBlock;
        private float elapsedTime = 0f;

        private void Awake()
        {
            wallRenderer = GetComponent<Renderer>();
            propertyBlock = new MaterialPropertyBlock();

            // Store initial position
            initialPosition = transform.position;
        }

        private void Update()
        {
            if (!isPushing || GameManager.Instance?.CurrentState != GameState.Playing)
                return;

            // Apply speed override for instant wall move debug mode
            float actualSpeed = GameManager.Instance?.InstantWallMove == true
                ? currentSpeed * 10f
                : currentSpeed;

            // Move wall
            transform.Translate(moveDirection * actualSpeed * Time.deltaTime, Space.World);

            // Increase speed over time
            if (speedRamp > 0)
            {
                elapsedTime += Time.deltaTime;
                currentSpeed += speedRamp * Time.deltaTime;
            }

            // Check game over condition
            CheckGameOverCondition();

            // Update visual feedback
            UpdateVisualFeedback();
        }

        /// <summary>
        /// Start pushing the wall forward.
        /// </summary>
        public void StartPushing()
        {
            isPushing = true;
            elapsedTime = 0f;
            Debug.Log($"Wall started pushing - Speed: {currentSpeed}, Ramp: {speedRamp}");
        }

        /// <summary>
        /// Stop pushing the wall.
        /// </summary>
        public void StopPushing()
        {
            isPushing = false;
            Debug.Log("Wall stopped pushing");
        }

        /// <summary>
        /// Reset wall to initial position and settings.
        /// </summary>
        public void ResetWall()
        {
            transform.position = initialPosition;
            isPushing = false;
            elapsedTime = 0f;

            // Reset color
            if (wallRenderer != null)
            {
                wallRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", normalColor);
                wallRenderer.SetPropertyBlock(propertyBlock);
            }

            Debug.Log("Wall reset to initial position");
        }

        /// <summary>
        /// Set wall speed parameters from level configuration.
        /// </summary>
        public void SetWallSpeed(float startSpeed, float ramp)
        {
            currentSpeed = startSpeed;
            speedRamp = ramp;

            Debug.Log($"Wall speed set - Start: {startSpeed}, Ramp: {ramp}");
        }

        /// <summary>
        /// Check if wall has reached the game over position.
        /// </summary>
        private void CheckGameOverCondition()
        {
            if (transform.position.z <= gameOverZ)
            {
                StopPushing();

                if (GameManager.Instance != null)
                {
                    GameManager.Instance.TriggerGameOver();
                }

                Debug.LogWarning("Wall reached spawn area - Game Over!");
            }
        }

        /// <summary>
        /// Update wall color based on distance to game over position.
        /// </summary>
        private void UpdateVisualFeedback()
        {
            if (wallRenderer == null) return;

            float distanceToGameOver = Mathf.Abs(transform.position.z - gameOverZ);

            if (distanceToGameOver <= warningDistance)
            {
                // Lerp to warning color
                float t = 1f - (distanceToGameOver / warningDistance);
                Color currentColor = Color.Lerp(normalColor, warningColor, t);

                wallRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", currentColor);
                wallRenderer.SetPropertyBlock(propertyBlock);
            }
            else
            {
                // Normal color
                wallRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", normalColor);
                wallRenderer.SetPropertyBlock(propertyBlock);
            }
        }

        /// <summary>
        /// Visualize wall bounds and game over line in editor.
        /// </summary>
        private void OnDrawGizmos()
        {
            if (!GameManager.Instance?.ShowDebugInfo ?? true) return;

            // Draw game over line
            Gizmos.color = Color.red;
            Vector3 gameOverPos = new Vector3(0, 0, gameOverZ);
            Gizmos.DrawLine(gameOverPos + Vector3.left * 10f, gameOverPos + Vector3.right * 10f);
            Gizmos.DrawLine(gameOverPos + Vector3.up * 5f, gameOverPos + Vector3.down * 2f);

            // Draw warning zone
            Gizmos.color = Color.yellow;
            Vector3 warningPos = new Vector3(0, 0, gameOverZ + warningDistance);
            Gizmos.DrawLine(warningPos + Vector3.left * 10f, warningPos + Vector3.right * 10f);
        }

        // Public getters
        public float CurrentSpeed => currentSpeed;
        public bool IsPushing => isPushing;
    }
}
