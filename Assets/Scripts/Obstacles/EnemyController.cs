using UnityEngine;
using System.Collections;

namespace Cubetris
{
    /// <summary>
    /// Controls enemy drone behavior.
    /// Example enemy: drone that temporarily disables a track.
    /// </summary>
    public class EnemyController : MonoBehaviour
    {
        [Header("Enemy Settings")]
        [SerializeField] private float moveSpeed = 3f;
        [SerializeField] private float lifetime = 10f;
        [SerializeField] private float disableTrackDuration = 3f;

        [Header("Movement Pattern")]
        [SerializeField] private Vector3 moveDirection = Vector3.back;
        [SerializeField] private float zigzagAmplitude = 2f;
        [SerializeField] private float zigzagFrequency = 1f;

        [Header("Visual")]
        [SerializeField] private Color enemyColor = new Color(1f, 0.3f, 0.3f);

        private float spawnTime;
        private Vector3 initialPosition;
        private Renderer enemyRenderer;

        private void Start()
        {
            spawnTime = Time.time;
            initialPosition = transform.position;

            enemyRenderer = GetComponent<Renderer>();
            if (enemyRenderer != null)
            {
                MaterialPropertyBlock block = new MaterialPropertyBlock();
                block.SetColor("_Color", enemyColor);
                enemyRenderer.SetPropertyBlock(block);
            }

            // Auto-destroy after lifetime
            Destroy(gameObject, lifetime);
        }

        private void Update()
        {
            // Move forward
            transform.Translate(moveDirection * moveSpeed * Time.deltaTime, Space.World);

            // Zigzag movement
            float zigzag = Mathf.Sin((Time.time - spawnTime) * zigzagFrequency) * zigzagAmplitude;
            Vector3 newPos = transform.position;
            newPos.x = initialPosition.x + zigzag;
            transform.position = newPos;

            // Rotate for visual effect
            transform.Rotate(Vector3.up, 100f * Time.deltaTime);
        }

        private void OnTriggerEnter(Collider other)
        {
            // Check if hit cube
            CubeController cube = other.GetComponent<CubeController>();
            if (cube != null)
            {
                // Destroy cube on contact
                cube.Explode();
                Debug.Log("Enemy destroyed a cube!");
            }

            // Check if reached spawn area
            if (other.CompareTag("SpawnArea"))
            {
                // Trigger some negative effect
                if (GameManager.Instance != null)
                {
                    GameManager.Instance.LoseLife();
                }

                Destroy(gameObject);
                Debug.Log("Enemy reached spawn area!");
            }
        }

        /// <summary>
        /// Visualize enemy path in editor.
        /// </summary>
        private void OnDrawGizmos()
        {
            if (!Application.isPlaying) return;

            Gizmos.color = enemyColor;
            Gizmos.DrawWireSphere(transform.position, 0.5f);

            // Draw movement direction
            Gizmos.DrawLine(transform.position, transform.position + moveDirection * 2f);
        }
    }
}
