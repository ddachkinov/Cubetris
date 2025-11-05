using UnityEngine;

namespace Cubetris
{
    /// <summary>
    /// Controls individual cube behavior, color, physics state, and grid registration.
    /// Handles collision detection and snapping to grid when at rest.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    [RequireComponent(typeof(BoxCollider))]
    public class CubeController : MonoBehaviour
    {
        [Header("Cube Properties")]
        [SerializeField] private CubeColorType colorType;
        [SerializeField] private Color cubeColor;
        [SerializeField] private bool isLaunched = false;
        [SerializeField] private bool isAtRest = false;

        [Header("Physics Settings")]
        [SerializeField] private float restVelocityThreshold = 0.1f;
        [SerializeField] private float restCheckDelay = 0.5f;

        [Header("Grid Settings")]
        [SerializeField] private bool isRegisteredInGrid = false;
        [SerializeField] private Vector2Int gridPosition;

        private Rigidbody rb;
        private Renderer cubeRenderer;
        private MaterialPropertyBlock propertyBlock;
        private float launchTime;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            cubeRenderer = GetComponent<Renderer>();

            // Create material property block for efficient color changes
            propertyBlock = new MaterialPropertyBlock();

            // Set up rigidbody defaults
            if (rb != null)
            {
                rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
                rb.interpolation = RigidbodyInterpolation.Interpolate;
            }
        }

        private void FixedUpdate()
        {
            if (!isLaunched || isAtRest) return;

            // Check if cube is at rest
            if (Time.time > launchTime + restCheckDelay)
            {
                CheckIfAtRest();
            }
        }

        /// <summary>
        /// Initialize cube with color and type.
        /// </summary>
        public void Initialize(CubeColorType type, Color color)
        {
            colorType = type;
            cubeColor = color;

            // Apply color to renderer
            if (cubeRenderer != null)
            {
                cubeRenderer.GetPropertyBlock(propertyBlock);
                propertyBlock.SetColor("_Color", cubeColor);
                cubeRenderer.SetPropertyBlock(propertyBlock);
            }

            // Reset state
            isLaunched = false;
            isAtRest = false;
            isRegisteredInGrid = false;
        }

        /// <summary>
        /// Set rigidbody kinematic state.
        /// </summary>
        public void SetKinematic(bool kinematic)
        {
            if (rb != null)
            {
                rb.isKinematic = kinematic;
                rb.velocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
            }
        }

        /// <summary>
        /// Called when cube is launched.
        /// </summary>
        public void OnLaunched()
        {
            isLaunched = true;
            isAtRest = false;
            launchTime = Time.time;
        }

        /// <summary>
        /// Check if cube velocity is low enough to be considered at rest.
        /// </summary>
        private void CheckIfAtRest()
        {
            if (rb == null) return;

            float velocityMagnitude = rb.velocity.magnitude;
            float angularVelocity = rb.angularVelocity.magnitude;

            if (velocityMagnitude < restVelocityThreshold && angularVelocity < restVelocityThreshold)
            {
                SetAtRest();
            }
        }

        /// <summary>
        /// Set cube as at rest and register in grid.
        /// </summary>
        private void SetAtRest()
        {
            if (isAtRest) return;

            isAtRest = true;

            // Stop physics
            if (rb != null)
            {
                rb.velocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.Sleep();
            }

            // Snap to grid position
            SnapToGrid();

            // Register in match detection grid
            RegisterInGrid();

            Debug.Log($"Cube at rest - Color: {colorType}, Position: {gridPosition}");
        }

        /// <summary>
        /// Snap cube position to nearest grid cell.
        /// </summary>
        private void SnapToGrid()
        {
            if (MatchDetector.Instance == null) return;

            Vector3 currentPos = transform.position;

            // Snap to grid (assuming 1.0 unit grid)
            Vector3 snappedPos = new Vector3(
                Mathf.Round(currentPos.x),
                Mathf.Round(currentPos.y),
                Mathf.Round(currentPos.z)
            );

            transform.position = snappedPos;

            // Calculate grid position
            gridPosition = MatchDetector.Instance.WorldToGrid(snappedPos);
        }

        /// <summary>
        /// Register this cube in the match detection grid.
        /// </summary>
        private void RegisterInGrid()
        {
            if (isRegisteredInGrid || MatchDetector.Instance == null) return;

            MatchDetector.Instance.RegisterCube(this, gridPosition);
            isRegisteredInGrid = true;

            // Check for matches after a brief delay to allow physics to settle
            Invoke(nameof(CheckMatches), 0.2f);
        }

        /// <summary>
        /// Trigger match detection check.
        /// </summary>
        private void CheckMatches()
        {
            if (MatchDetector.Instance != null)
            {
                MatchDetector.Instance.CheckMatchesAt(gridPosition);
            }
        }

        /// <summary>
        /// Unregister this cube from the grid.
        /// </summary>
        public void UnregisterFromGrid()
        {
            if (!isRegisteredInGrid || MatchDetector.Instance == null) return;

            MatchDetector.Instance.UnregisterCube(gridPosition);
            isRegisteredInGrid = false;
        }

        /// <summary>
        /// Trigger explosion effect for this cube.
        /// </summary>
        public void Explode()
        {
            // Unregister from grid
            UnregisterFromGrid();

            // Trigger explosion effect
            if (ExplosionEffect.Instance != null)
            {
                ExplosionEffect.Instance.CreateExplosion(transform.position, cubeColor);
            }

            // Return to pool or destroy
            if (ObjectPool.Instance != null)
            {
                ObjectPool.Instance.ReturnCube(gameObject);
            }
            else
            {
                Destroy(gameObject);
            }
        }

        /// <summary>
        /// Reset cube state for pooling.
        /// </summary>
        public void ResetCube()
        {
            isLaunched = false;
            isAtRest = false;
            isRegisteredInGrid = false;
            colorType = CubeColorType.Red;

            if (rb != null)
            {
                rb.velocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.isKinematic = true;
            }

            transform.rotation = Quaternion.identity;
        }

        private void OnCollisionEnter(Collision collision)
        {
            // Play sound on collision (if audio manager exists)
            // AudioManager.Instance?.PlayCubeCollisionSound();
        }

        // Public getters
        public CubeColorType ColorType => colorType;
        public Color CubeColor => cubeColor;
        public bool IsAtRest => isAtRest;
        public Vector2Int GridPosition => gridPosition;
    }
}
